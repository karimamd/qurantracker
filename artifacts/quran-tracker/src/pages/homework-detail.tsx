import {
  useGetHomework,
  useUpdateHomeworkItem,
  useListActivePageMistakes,
  getGetHomeworkQueryKey,
  getListHomeworkQueryKey,
  getGetProgressOverviewQueryKey,
  getListPageProgressQueryKey,
  type ActiveAyahMistake,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQueryClient, useQueries } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, X } from "lucide-react";
import { PageRow } from "@/components/page-row";
import { type Quality, QUALITIES } from "@/lib/quality";
import { fetchPageAyahs, pageAyahsQueryKey, type ApiAyah } from "@/hooks/use-page-ayahs";
import { useTranslation } from "react-i18next";
import { useMemo } from "react";

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

function usePagesCoverage(pageNumbers: number[]): Map<number, PageCoverage> {
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
      queryKey: [`/api/progress/pages/${pageNumber}/active-mistakes`] as const,
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
      const ayahs = (ayahsRes.data ?? []) as ApiAyah[];
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
  }, [uniquePages, ayahsResults, mistakesResults]);
}

export default function HomeworkDetail() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const homeworkId = parseInt(params.id || "0", 10);
  const { data: detail, isLoading } = useGetHomework(homeworkId, {
    query: { enabled: !!homeworkId, queryKey: getGetHomeworkQueryKey(homeworkId) },
  });
  const updateItem = useUpdateHomeworkItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

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
        onError: () => toast({ title: t("homework.updateFailed"), variant: "destructive" }),
      }
    );
  };

  const handleClear = (itemId: number) => {
    updateItem.mutate(
      { homeworkId, itemId, data: { completed: false } },
      {
        onSuccess: invalidate,
        onError: () => toast({ title: t("homework.clearFailed"), variant: "destructive" }),
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
  const coverageByPage = usePagesCoverage(allPageNumbers);

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
            <span className="font-normal text-sm text-muted-foreground">
              {doneCount}/{items.length}
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
        <div>
          <h2 className="text-2xl font-semibold">{detail.title}</h2>
          <p className="text-sm text-muted-foreground">
            {t("common.due")}: {new Date(detail.dueDate).toLocaleDateString()}
          </p>
        </div>
      </div>

      {renderItems(memorizeItems, t("homework.pagesToMemorize"))}
      {renderItems(reviseItems, t("homework.pagesToRevise"))}

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
