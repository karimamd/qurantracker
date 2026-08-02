import {
  useGetHomework,
  useUpdateHomework,
  useUpdateHomeworkItem,
  useListActivePageMistakes,
  useGetHomeworkAyahs,
  useGetSettings,
  getGetHomeworkQueryKey,
  getGetHomeworkAyahsQueryKey,
  getListHomeworkQueryKey,
  getGetProgressOverviewQueryKey,
  getListPageProgressQueryKey,
  getListActivePageMistakesQueryKey,
  isOfflineQueued,
  type ActiveAyahMistake,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, X, Pencil, ChevronDown, Link2, BookOpen, Play } from "lucide-react";
import { PageRow } from "@/components/page-row";
import { type Quality, QUALITIES } from "@/lib/quality";
import { fetchPageAyahs, pageAyahsQueryKey, type ApiAyah } from "@/hooks/use-page-ayahs";
import { HomeworkRangePickers } from "@/components/homework-range-pickers";
import { parsePageRange, appendPageRange, compressPages } from "@/lib/homework-pages";
import { getAyahIndex, type AyahIndexEntry } from "@/lib/ayah-index";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useState } from "react";

/**
 * Per-page ayah coverage summary derived from two server-cached sources:
 *   1. The bundled / API page text (usePageAyahs query) → total ayahs.
 *   2. The persisted active per-ayah marks (useListActivePageMistakes) →
 *      which of those ayahs are currently "cleared" (positive tick) and
 *      which still carry an unresolved memorization / link mistake.
 *
 * "done" follows the user-facing rule: an ayah counts only when explicitly
 * marked clear AND has no active mistake on it. Unmarked ayahs are NOT
 * counted as done. Because both underlying queries are React-Query-cached
 * by the same keys the reader uses, marking an ayah anywhere in the app
 * automatically updates this view via the shared cache.
 */
type PageCoverage = { total: number; done: number; loading: boolean };

function usePagesCoverage(
  pageNumbers: number[],
  firstGlobalAyah?: number | null,
  lastGlobalAyah?: number | null,
): Map<number, PageCoverage> {
  // Stable list so useQueries doesn't re-run every render. We dedupe and
  // sort so identical homework configurations produce identical query
  // sets (helps React Query reuse).
  const uniquePages = useMemo(() => {
    return Array.from(new Set(pageNumbers)).sort((a, b) => a - b);
  }, [pageNumbers]);

  const ayahsResults = useQueries({
    queries: uniquePages.map(pageNumber => ({
      queryKey: pageAyahsQueryKey(pageNumber),
      queryFn: ({ signal }: { signal?: AbortSignal }) => fetchPageAyahs(pageNumber, signal),
      staleTime: Infinity,
    })),
  });

  const mistakesResults = useQueries({
    queries: uniquePages.map(pageNumber => ({
      // Use the generated query key so this cache entry is shared with the
      // reader's per-ayah mistake mutations — when the user marks an ayah
      // on /reader, the optimistic setQueryData and invalidations there
      // automatically flow into this view's coverage badges.
      queryKey: getListActivePageMistakesQueryKey(pageNumber),
      queryFn: async ({ signal }: { signal?: AbortSignal }) => {
        const res = await fetch(`/api/progress/pages/${pageNumber}/active-mistakes`, {
          credentials: "include",
          signal,
        });
        if (!res.ok) throw new Error(`Failed to fetch active mistakes for page ${pageNumber}`);
        return (await res.json()) as ActiveAyahMistake[];
      },
    })),
  });

  return useMemo(() => {
    const map = new Map<number, PageCoverage>();
    uniquePages.forEach((pageNumber, idx) => {
      const ayahsRes = ayahsResults[idx];
      const mistakesRes = mistakesResults[idx];
      let ayahs = (ayahsRes.data ?? []) as ApiAyah[];
      // Apply tight ayah-level boundary so pages that sit at the edge of a
      // surah/part only count in-scope ayahs, not every ayah on the page.
      if (firstGlobalAyah != null && lastGlobalAyah != null) {
        ayahs = ayahs.filter(a => a.number >= firstGlobalAyah && a.number <= lastGlobalAyah);
      }
      const marks = (mistakesRes.data ?? []) as ActiveAyahMistake[];
      const total = ayahs.length;
      const cleared = new Set<number>();
      const blocked = new Set<number>();
      for (const m of marks) {
        if (m.mistakeType === "cleared") cleared.add(m.globalAyahNumber);
        else if (m.mistakeType === "memorization" || m.mistakeType === "link") blocked.add(m.globalAyahNumber);
      }
      // The server already enforces mutual exclusion, but guard here too
      // so a stale cache between the two parallel queries can't double-count.
      let done = 0;
      for (const a of ayahs) {
        if (cleared.has(a.number) && !blocked.has(a.number)) done++;
      }
      map.set(pageNumber, {
        total,
        done,
        loading: ayahsRes.isLoading || mistakesRes.isLoading,
      });
    });
    return map;
  }, [uniquePages, ayahsResults, mistakesResults, firstGlobalAyah, lastGlobalAyah]);
}

/** Badge styling per active status, mirroring the Mistakes page palette. */
const AYAH_STATUS_STYLE: Record<"cleared" | "memorization" | "link", { chip: string; icon: typeof Check }> = {
  cleared: { chip: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: Check },
  memorization: { chip: "bg-rose-100 text-rose-700 border-rose-200", icon: X },
  link: { chip: "bg-amber-100 text-amber-800 border-amber-200", icon: Link2 },
};

/** First few Arabic words of an ayah for a compact preview. */
function firstWords(text: string, count = 7): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const slice = words.slice(0, count).join(" ");
  return words.length > count ? `${slice}…` : slice;
}

/**
 * "Ayah by ayah" — lists every ayah on the homework's pages (grouped by
 * page, collapsible) with its current status, last status date, weekly
 * attempt count, a "last visited" highlight, and deep links into the
 * single-ayah view and the Reader's practice mode.
 *
 * Ayah metadata (surah name, number-in-surah, Arabic text) is resolved
 * client-side from the bundled AyahIndex; the server only sends status /
 * counts keyed by global ayah number.
 */
function AyahByAyahSection({ homeworkId }: { homeworkId: number }) {
  const { t } = useTranslation();
  const { data, isLoading } = useGetHomeworkAyahs(homeworkId, {
    query: { enabled: !!homeworkId, queryKey: getGetHomeworkAyahsQueryKey(homeworkId) },
  });

  const [index, setIndex] = useState<Map<number, AyahIndexEntry> | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [expandedPages, setExpandedPages] = useState<Set<number>>(new Set());
  const [autoExpanded, setAutoExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAyahIndex()
      .then((entries) => {
        if (cancelled) return;
        const map = new Map<number, AyahIndexEntry>();
        for (const e of entries) map.set(e.globalAyahNumber, e);
        setIndex(map);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Group ayahs by page, preserving the server's ordering.
  type AyahEntry = NonNullable<typeof data>["ayahs"][number];
  const pages = useMemo(() => {
    const groups = new Map<number, AyahEntry[]>();
    for (const a of data?.ayahs ?? []) {
      let arr = groups.get(a.pageNumber);
      if (!arr) { arr = []; groups.set(a.pageNumber, arr); }
      arr.push(a);
    }
    return Array.from(groups.entries()).sort((x, y) => x[0] - y[0]);
  }, [data]);

  // Auto-expand the page containing the last-visited ayah (once).
  const lastVisited = data?.lastVisitedGlobalAyahNumber ?? null;
  useEffect(() => {
    if (autoExpanded || lastVisited == null || !data) return;
    const entry = data.ayahs.find(a => a.globalAyahNumber === lastVisited);
    if (entry) {
      setExpandedPages(prev => new Set(prev).add(entry.pageNumber));
      setAutoExpanded(true);
    }
  }, [autoExpanded, lastVisited, data]);

  const togglePage = (page: number) => {
    setExpandedPages(prev => {
      const next = new Set(prev);
      if (next.has(page)) next.delete(page); else next.add(page);
      return next;
    });
  };

  if (isLoading) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("homework.ayahByAyah.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.ayahs.length === 0) {
    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("homework.ayahByAyah.title")}</CardTitle>
        </CardHeader>
        <CardContent className="py-6 text-center">
          <p className="text-sm text-muted-foreground">{t("homework.ayahByAyah.empty")}</p>
        </CardContent>
      </Card>
    );
  }

  const isDone = (statuses: string[]) =>
    statuses.includes("cleared") && !statuses.includes("memorization") && !statuses.includes("link");

  return (
    <Card className="border shadow-sm" data-testid="hw-ayah-by-ayah">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t("homework.ayahByAyah.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("homework.ayahByAyah.subtitle")}</p>
      </CardHeader>
      <CardContent className="p-0">
        {loadError && (
          <p className="px-4 py-3 text-sm text-amber-600">{t("homework.ayahByAyah.loadError")}</p>
        )}
        <div className="divide-y">
          {pages.map(([page, ayahs]) => {
            const open = expandedPages.has(page);
            const doneCount = ayahs.filter(a => isDone(a.statuses)).length;
            return (
              <div key={page}>
                <button
                  type="button"
                  onClick={() => togglePage(page)}
                  className="w-full flex items-center gap-2 px-4 py-3 text-start hover:bg-muted/50 transition-colors"
                  aria-expanded={open}
                  data-testid={`hw-ayah-page-toggle-${page}`}
                >
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90 rtl:rotate-90"}`} />
                  <span className="font-medium text-sm">{t("homework.ayahByAyah.pageLabel", { page })}</span>
                  <Badge variant="outline" className="text-xs py-0 ms-auto inline-flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" />
                    {t("homework.ayahByAyah.pageProgress", { done: doneCount, total: ayahs.length })}
                  </Badge>
                </button>
                {open && (
                  <div className="divide-y bg-muted/20">
                    {ayahs.map(a => {
                      const entry = index?.get(a.globalAyahNumber);
                      const isLast = a.globalAyahNumber === lastVisited;
                      return (
                        <div
                          key={a.globalAyahNumber}
                          className={`px-4 py-3 ps-8 ${isLast ? "bg-primary/5 border-s-2 border-s-primary" : ""}`}
                          data-testid={`hw-ayah-row-${a.globalAyahNumber}`}
                        >
                          <div className="flex items-start gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">
                                  {entry
                                    ? `${entry.surahName} · ${t("homework.ayahByAyah.ayahLabel", { n: entry.numberInSurah })}`
                                    : t("homework.ayahByAyah.ayahLabel", { n: a.globalAyahNumber })}
                                </span>
                                {isLast && (
                                  <Badge variant="outline" className="text-[10px] py-0 border-primary/40 text-primary">
                                    {t("homework.ayahByAyah.lastVisited")}
                                  </Badge>
                                )}
                              </div>
                              {entry && (
                                <p className="mt-1 text-base leading-relaxed text-foreground/90 font-arabic" dir="rtl">
                                  {firstWords(entry.text)}
                                </p>
                              )}
                              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                {a.statuses.length === 0 ? (
                                  <span className="text-xs text-muted-foreground">{t("homework.ayahByAyah.notStarted")}</span>
                                ) : (
                                  a.statuses.map(s => {
                                    const style = AYAH_STATUS_STYLE[s as keyof typeof AYAH_STATUS_STYLE];
                                    if (!style) return null;
                                    const Icon = style.icon;
                                    return (
                                      <span
                                        key={s}
                                        className={`text-xs inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${style.chip}`}
                                      >
                                        <Icon className="w-3 h-3" />
                                        {t(`homework.ayahByAyah.status${s.charAt(0).toUpperCase()}${s.slice(1)}` as const)}
                                      </span>
                                    );
                                  })
                                )}
                                {a.lastStatusAt && (
                                  <span className="text-xs text-muted-foreground">
                                    {t("homework.ayahByAyah.lastStatusAt", { date: new Date(a.lastStatusAt).toLocaleDateString() })}
                                  </span>
                                )}
                                <span
                                  className="text-xs text-muted-foreground"
                                  title={t("homework.ayahByAyah.weekAttemptsTitle")}
                                >
                                  · {t("homework.ayahByAyah.weekAttempts", { count: a.weekAttemptCount })}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Link href={`/ayahs/${a.globalAyahNumber}`}>
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" data-testid={`hw-ayah-open-${a.globalAyahNumber}`}>
                                  <BookOpen className="w-3 h-3 me-1" />
                                  {t("homework.ayahByAyah.openAyah")}
                                </Button>
                              </Link>
                              <Link href={`/reader/${a.pageNumber}?practice=${a.globalAyahNumber}`}>
                                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" data-testid={`hw-ayah-practice-${a.globalAyahNumber}`}>
                                  <Play className="w-3 h-3 me-1" />
                                  {t("homework.ayahByAyah.practice")}
                                </Button>
                              </Link>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export default function HomeworkDetail() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const homeworkId = parseInt(params.id || "0", 10);
  const { data: detail, isLoading } = useGetHomework(homeworkId, {
    query: { enabled: !!homeworkId, queryKey: getGetHomeworkQueryKey(homeworkId) },
  });
  const updateItem = useUpdateHomeworkItem();
  const updateHomework = useUpdateHomework();
  const { data: settings } = useGetSettings();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Per-page weekly read target. "Either one counts" — weekCount already sums
  // recitations + Telawa reads server-side, so the bar reflects all reading.
  const weeklyReadGoal = Math.max(1, settings?.homeworkWeeklyReadGoal ?? 3);

  // Edit dialog state — pre-populated from `detail` whenever the dialog is
  // opened so the user sees their current title / due date / page lists,
  // not stale values from a previous open.
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editMemorizeRange, setEditMemorizeRange] = useState("");
  const [editReviseRange, setEditReviseRange] = useState("");
  const [editFirstGlobalAyah, setEditFirstGlobalAyah] = useState<number | null>(null);
  const [editLastGlobalAyah, setEditLastGlobalAyah] = useState<number | null>(null);

  const expandEditBounds = (fga: number | undefined, lga: number | undefined) => {
    if (fga == null || lga == null) return;
    setEditFirstGlobalAyah(prev => (prev == null ? fga : Math.min(prev, fga)));
    setEditLastGlobalAyah(prev => (prev == null ? lga : Math.max(prev, lga)));
  };

  const openEdit = () => {
    if (!detail) return;
    setEditTitle(detail.title);
    // Due dates are stored / transmitted as UTC midnight (the create flow
    // uses `new Date("YYYY-MM-DD").toISOString()` which parses the bare
    // date string as UTC). Read them back with UTC getters so users west
    // of UTC don't see the previous day in the date input — which would
    // otherwise silently shift the due date earlier by one day every
    // time they re-saved without changing the field.
    const d = new Date(detail.dueDate);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    setEditDueDate(`${yyyy}-${mm}-${dd}`);
    setEditMemorizeRange(compressPages(detail.items.filter(i => i.type === "memorize").map(i => i.pageNumber)));
    setEditReviseRange(compressPages(detail.items.filter(i => i.type === "revise").map(i => i.pageNumber)));
    setEditFirstGlobalAyah(detail.firstGlobalAyah ?? null);
    setEditLastGlobalAyah(detail.lastGlobalAyah ?? null);
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!detail) return;
    if (!editTitle || !editDueDate) {
      toast({ title: t("homework.requiredFields"), variant: "destructive" });
      return;
    }
    updateHomework.mutate(
      {
        id: homeworkId,
        data: {
          title: editTitle,
          // Match the create flow's UTC-midnight semantics: anchor the
          // user-picked calendar date to UTC so the round-trip with
          // openEdit() above is stable across timezones.
          dueDate: new Date(`${editDueDate}T00:00:00.000Z`).toISOString(),
          memorizePages: parsePageRange(editMemorizeRange),
          revisePages: parsePageRange(editReviseRange),
          // Always send boundaries so the user can clear them by editing
          // without picking a new surah/part (null = use all ayahs on pages).
          firstGlobalAyah: editFirstGlobalAyah,
          lastGlobalAyah: editLastGlobalAyah,
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("homework.updated") });
          setEditOpen(false);
          // Refetch detail + list so the new pages and progress show up.
          queryClient.invalidateQueries({ queryKey: getGetHomeworkQueryKey(homeworkId) });
          // Page membership may have changed, so the ayah-by-ayah list must
          // refetch too or it keeps showing ayahs for the old page set.
          queryClient.invalidateQueries({ queryKey: getGetHomeworkAyahsQueryKey(homeworkId) });
          queryClient.invalidateQueries({ queryKey: getListHomeworkQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
        },
        onError: () => toast({ title: t("homework.updateFailed"), variant: "destructive" }),
      },
    );
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetHomeworkQueryKey(homeworkId) });
    queryClient.invalidateQueries({ queryKey: getListHomeworkQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
  };

  const handleQualitySelect = (itemId: number, quality: Quality) => {
    const isCompleted = QUALITIES.find(q => q.value === quality)!.completed;
    updateItem.mutate(
      { homeworkId, itemId, data: { completed: isCompleted, quality } },
      {
        onSuccess: invalidate,
        onError: (err) => {
          if (isOfflineQueued(err)) { toast({ title: t("offline.savedLocally") }); return; }
          toast({ title: t("homework.updateFailed"), variant: "destructive" });
        },
      }
    );
  };

  const handleClear = (itemId: number) => {
    updateItem.mutate(
      { homeworkId, itemId, data: { completed: false } },
      {
        onSuccess: invalidate,
        onError: (err) => {
          if (isOfflineQueued(err)) { toast({ title: t("offline.savedLocally") }); return; }
          toast({ title: t("homework.clearFailed"), variant: "destructive" });
        },
      }
    );
  };

  // Fire one ayahs + one active-mistakes query per page in parallel. Called
  // unconditionally before any early return so React's Rules of Hooks are
  // honored across loading → loaded transitions (otherwise hook count
  // changes between renders and React throws "Rendered more hooks…").
  // These queries share React-Query cache with the reader, so marking an
  // ayah in the reader will live-update the counts shown here.
  const allPageNumbers = (detail?.items ?? []).map(i => i.pageNumber);
  const coverageByPage = usePagesCoverage(
    allPageNumbers,
    detail?.firstGlobalAyah,
    detail?.lastGlobalAyah,
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!detail) return <div>{t("common.notFound")}</div>;

  const memorizeItems = detail.items.filter(i => i.type === "memorize");
  const reviseItems   = detail.items.filter(i => i.type === "revise");

  const aggregateCoverage = (items: typeof detail.items): { total: number; done: number; loading: boolean } => {
    let total = 0, done = 0, loading = false;
    for (const item of items) {
      const c = coverageByPage.get(item.pageNumber);
      if (!c) { loading = true; continue; }
      total += c.total;
      done += c.done;
      if (c.loading) loading = true;
    }
    return { total, done, loading };
  };

  const lastStoppedId = detail.items.reduce<number | null>((best, item) => {
    if (!item.completedAt) return best;
    if (best === null) return item.id;
    const prev = detail.items.find(i => i.id === best);
    const prevTime = prev?.completedAt ? new Date(prev.completedAt).getTime() : 0;
    return new Date(item.completedAt).getTime() > prevTime ? item.id : best;
  }, null);

  const renderItems = (items: typeof detail.items, label: string) => {
    if (items.length === 0) return null;

    const doneCount = items.filter(i => i.completed).length;
    const needsWorkCount = items.filter(i => !i.completed && i.quality && ["hard", "relearn"].includes(i.quality)).length;
    const ayahCoverage = aggregateCoverage(items);

    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            {label}
            <span
              className="font-normal text-sm text-muted-foreground"
              title={t("homework.pagesProgressTitle")}
            >
              {t("homework.pagesProgress", { done: doneCount, total: items.length })}
              {needsWorkCount > 0 && (
                <span className="ms-1 text-amber-600">· {t("homework.needsWork", { count: needsWorkCount })}</span>
              )}
            </span>
            {ayahCoverage.total > 0 && (
              <span
                className="font-normal text-xs text-muted-foreground inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5"
                data-testid={`hw-section-ayah-coverage-${items[0]?.type ?? ""}`}
                title={t("homework.ayahCoverageTitle")}
              >
                <Check className="w-3 h-3 text-emerald-600" />
                {t("homework.ayahCoverage", { done: ayahCoverage.done, total: ayahCoverage.total })}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {items.map(item => {
              const hasQuality = !!item.quality;
              const isLastStopped = item.id === lastStoppedId;
              const cov = coverageByPage.get(item.pageNumber);
              return (
                <PageRow
                  key={item.id}
                  pageNumber={item.pageNumber}
                  customName={item.customName}
                  quality={item.quality ?? null}
                  status="on_track"
                  inScope={true}
                  lastRecited={item.completedAt ?? null}
                  weekCount={item.weekCount ?? 0}
                  homeworkId={homeworkId}
                  highlight={isLastStopped}
                  highlightLabel={isLastStopped ? t("homework.lastStopped") : undefined}
                  onQualitySelect={(q) => handleQualitySelect(item.id, q)}
                  qualityPending={updateItem.isPending}
                  testIdPrefix="hw-item"
                  rowId={item.id}
                  extraBadges={
                    <>
                      <Badge variant="outline" className="text-xs py-0">{item.type === "memorize" ? t("homework.memorize") : t("homework.revise")}</Badge>
                      {(() => {
                        const wc = item.weekCount ?? 0;
                        const met = wc >= weeklyReadGoal;
                        const pct = Math.min(100, Math.round((wc / weeklyReadGoal) * 100));
                        return (
                          <span
                            className={`text-xs py-0 inline-flex items-center gap-1.5 rounded-full border px-2 ${
                              met
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-border bg-muted text-muted-foreground"
                            }`}
                            data-testid={`hw-item-weekly-read-${item.id}`}
                            title={t("homework.weeklyReadTitle", { goal: weeklyReadGoal })}
                          >
                            {met && <Check className="w-3 h-3" />}
                            <span className="tabular-nums">{t("homework.weeklyRead", { done: wc, goal: weeklyReadGoal })}</span>
                            <span className="w-10 h-1 rounded-full bg-foreground/10 overflow-hidden">
                              <span
                                className={`block h-full ${met ? "bg-emerald-500" : "bg-primary"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </span>
                          </span>
                        );
                      })()}
                      {cov && cov.total > 0 && (
                        <Badge
                          variant="outline"
                          className="text-xs py-0 inline-flex items-center gap-1"
                          data-testid={`hw-item-ayah-coverage-${item.id}`}
                          title={t("homework.ayahCoverageTitle")}
                        >
                          <Check className="w-3 h-3 text-emerald-600" />
                          {cov.done}/{cov.total}
                        </Badge>
                      )}
                    </>
                  }
                  extraActions={
                    hasQuality ? (
                      <button
                        onClick={() => handleClear(item.id)}
                        disabled={updateItem.isPending}
                        className="ml-1 w-6 h-6 flex items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                        aria-label={t("homework.clearQuality")}
                        data-testid={`hw-clear-btn-${item.id}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    ) : null
                  }
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6" data-testid="homework-detail-page">
      <div className="flex items-center gap-3">
        <Link href="/homework">
          <Button variant="ghost" size="sm" data-testid="back-to-homework">
            <ArrowLeft className="w-4 h-4 me-1 rtl:rotate-180" /> {t("common.back")}
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-semibold">{detail.title}</h2>
          <p className="text-sm text-muted-foreground">
            {t("common.due")}: {new Date(detail.dueDate).toLocaleDateString()}
          </p>
        </div>
        <Dialog open={editOpen} onOpenChange={(o) => (o ? openEdit() : setEditOpen(false))}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" data-testid="btn-edit-homework">
              <Pencil className="w-3.5 h-3.5 me-1" /> {t("homework.editButton")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("homework.editSession")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>{t("homework.form.title")}</Label>
                <Input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  data-testid="input-hw-edit-title"
                />
              </div>
              <div>
                <Label>{t("homework.form.dueDate")}</Label>
                <Input
                  type="date"
                  value={editDueDate}
                  onChange={e => setEditDueDate(e.target.value)}
                  data-testid="input-hw-edit-due"
                />
              </div>
              <div>
                <Label>{t("homework.form.memorize")}</Label>
                <Input
                  value={editMemorizeRange}
                  onChange={e => setEditMemorizeRange(e.target.value)}
                  placeholder={t("homework.form.memorizePlaceholder")}
                  data-testid="input-hw-edit-memorize"
                />
                <HomeworkRangePickers
                  testIdPrefix="edit-memorize"
                  onPick={(start, end, fga, lga) => {
                    setEditMemorizeRange(appendPageRange(editMemorizeRange, start, end));
                    expandEditBounds(fga, lga);
                  }}
                />
                <p className="text-xs text-muted-foreground mt-1">{t("homework.form.rangeHint")}</p>
              </div>
              <div>
                <Label>{t("homework.form.revise")}</Label>
                <Input
                  value={editReviseRange}
                  onChange={e => setEditReviseRange(e.target.value)}
                  placeholder={t("homework.form.revisePlaceholder")}
                  data-testid="input-hw-edit-revise"
                />
                <HomeworkRangePickers
                  testIdPrefix="edit-revise"
                  onPick={(start, end, fga, lga) => {
                    setEditReviseRange(appendPageRange(editReviseRange, start, end));
                    expandEditBounds(fga, lga);
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("homework.editPreserveHint")}</p>
              <Button
                onClick={handleSaveEdit}
                disabled={updateHomework.isPending}
                className="w-full"
                data-testid="btn-submit-edit-homework"
              >
                {updateHomework.isPending ? t("common.saving") : t("common.save")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {renderItems(memorizeItems, t("homework.pagesToMemorize"))}
      {renderItems(reviseItems, t("homework.pagesToRevise"))}

      {detail.items.length > 0 && <AyahByAyahSection homeworkId={homeworkId} />}

      {detail.items.length === 0 && (
        <Card className="border shadow-sm">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">{t("homework.noItems")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
