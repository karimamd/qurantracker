import {
  useListPageProgress,
  useUpdatePageProgress,
  getListPageProgressQueryKey,
  getGetProgressOverviewQueryKey,
  getListJuzProgressQueryKey,
  getListSurahProgressQueryKey,
  getListRob3ProgressQueryKey,
  getGetRecentActivityQueryKey,
  getGetJuzDetailQueryKey,
  getGetSurahDetailQueryKey,
  getListHomeworkQueryKey,
} from "@workspace/api-client-react";
import type { PageProgress } from "@workspace/api-client-react";
import { useParams, useLocation } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { QualityBadge, StatusBadge } from "@/components/quality-badge";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, BookMarked, Search, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { SURAHS, JUZ_RANGES, ALL_ROB3S, TOTAL_PAGES } from "@/lib/quran-ref";
import { getDefaultPageName } from "@/lib/page-names";

type Quality = "excellent" | "good" | "hard" | "relearn";

const QUALITIES: { value: Quality; label: string }[] = [
  { value: "excellent", label: "Excellent" },
  { value: "good", label: "Good" },
  { value: "hard", label: "Hard" },
  { value: "relearn", label: "Relearn" },
];

const qualityStyle: Record<Quality, { active: string; hover: string }> = {
  excellent: { active: "bg-emerald-500 border-emerald-500 text-white", hover: "hover:border-emerald-300 hover:text-emerald-700" },
  good:      { active: "bg-sky-500 border-sky-500 text-white",         hover: "hover:border-sky-300 hover:text-sky-700" },
  hard:      { active: "bg-amber-500 border-amber-500 text-white",     hover: "hover:border-amber-300 hover:text-amber-700" },
  relearn:   { active: "bg-rose-500 border-rose-500 text-white",       hover: "hover:border-rose-300 hover:text-rose-700" },
};

interface ApiAyah {
  number: number;
  text: string;
  numberInSurah: number;
  surah: { number: number; englishName: string; englishNameTranslation: string };
}
interface ApiPageResponse {
  code: number;
  status: string;
  data: { number: number; ayahs: ApiAyah[] };
}

async function fetchPageAyahs(pageNumber: number, signal?: AbortSignal): Promise<ApiAyah[]> {
  const res = await fetch(
    `https://api.alquran.cloud/v1/page/${pageNumber}/quran-uthmani`,
    { signal },
  );
  if (!res.ok) throw new Error(`Failed to load page ${pageNumber}: ${res.status}`);
  const json = (await res.json()) as ApiPageResponse;
  if (json.code !== 200 || !json.data?.ayahs) throw new Error(`Invalid response for page ${pageNumber}`);
  return json.data.ayahs;
}

function clampPage(n: number): number {
  if (Number.isNaN(n)) return 1;
  return Math.min(TOTAL_PAGES, Math.max(1, Math.floor(n)));
}

function getJuzForPage(pageNumber: number): number {
  for (const j of JUZ_RANGES) {
    if (pageNumber >= j.startPage && pageNumber <= j.endPage) return j.juz;
  }
  return 1;
}

function getRob3ForPage(pageNumber: number): { rob3: number; partInJuz: number } {
  let result = ALL_ROB3S[0];
  for (const r of ALL_ROB3S) {
    if (r.startPage <= pageNumber) result = r;
    else break;
  }
  return { rob3: result.rob3, partInJuz: result.rob3InJuz + 1 };
}

function arabicNumeral(n: number): string {
  return String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d, 10)]);
}

export default function Reader() {
  const params = useParams<{ page?: string }>();
  const [, setLocation] = useLocation();
  const initialPage = clampPage(params.page ? parseInt(params.page, 10) : 1);

  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [pageInput, setPageInput] = useState<string>(String(initialPage));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [surahSearch, setSurahSearch] = useState("");

  const { data: allPages, isLoading: pagesLoading } = useListPageProgress({});
  const updatePage = useUpdatePageProgress();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    data: ayahs,
    isLoading: ayahsLoading,
    isError: ayahsError,
    refetch: refetchAyahs,
  } = useQuery({
    queryKey: ["alquran-cloud-page", pageNumber],
    queryFn: ({ signal }) => fetchPageAyahs(pageNumber, signal),
    staleTime: 1000 * 60 * 60,
    gcTime: 1000 * 60 * 60,
    retry: 1,
  });

  // URL -> state sync (only when user navigates browser back/forward)
  useEffect(() => {
    if (!params.page) return;
    const n = clampPage(parseInt(params.page, 10));
    setPageNumber(prev => (prev === n ? prev : n));
  }, [params.page]);

  // Reset the input value whenever the page changes
  useEffect(() => {
    setPageInput(String(pageNumber));
  }, [pageNumber]);

  const goToPage = (n: number) => {
    const clamped = clampPage(n);
    if (clamped === pageNumber) return;
    setPageNumber(clamped);
    setLocation(`/reader/${clamped}`);
  };

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (sheetOpen) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goToPage(pageNumber + 1);
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToPage(pageNumber - 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNumber, sheetOpen]);

  // Prefetch the next page's ayahs for instant nav
  useEffect(() => {
    if (pageNumber >= TOTAL_PAGES) return;
    const next = pageNumber + 1;
    queryClient.prefetchQuery({
      queryKey: ["alquran-cloud-page", next],
      queryFn: ({ signal }) => fetchPageAyahs(next, signal),
      staleTime: 1000 * 60 * 60,
    });
  }, [pageNumber, queryClient]);

  const currentPage: PageProgress | null = useMemo(() => {
    if (!allPages) return null;
    return allPages.find(p => p.pageNumber === pageNumber) ?? null;
  }, [allPages, pageNumber]);

  const surahsOnPage = useMemo(
    () => SURAHS.filter(s => s.startPage <= pageNumber && s.endPage >= pageNumber),
    [pageNumber],
  );
  const juzNumber = getJuzForPage(pageNumber);
  const { rob3, partInJuz } = getRob3ForPage(pageNumber);
  const arabicName = getDefaultPageName(pageNumber);

  const filteredSurahs = useMemo(() => {
    const q = surahSearch.trim().toLowerCase();
    if (!q) return SURAHS;
    return SURAHS.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.arabic.includes(q) ||
      String(s.number) === q
    );
  }, [surahSearch]);

  // Group consecutive ayahs by surah for rendering
  const groupedAyahs = useMemo(() => {
    if (!ayahs) return [] as { surahNumber: number; surahName: string; ayahs: ApiAyah[]; isFirstAyah: boolean }[];
    const groups: { surahNumber: number; surahName: string; ayahs: ApiAyah[]; isFirstAyah: boolean }[] = [];
    for (const a of ayahs) {
      const last = groups[groups.length - 1];
      if (last && last.surahNumber === a.surah.number) {
        last.ayahs.push(a);
      } else {
        groups.push({
          surahNumber: a.surah.number,
          surahName: a.surah.englishName,
          ayahs: [a],
          isFirstAyah: a.numberInSurah === 1,
        });
      }
    }
    return groups;
  }, [ayahs]);

  const invalidateProgressData = () => {
    queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListJuzProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListSurahProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListRob3ProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetJuzDetailQueryKey(juzNumber) });
    for (const s of surahsOnPage) {
      queryClient.invalidateQueries({ queryKey: getGetSurahDetailQueryKey(s.number) });
    }
    queryClient.invalidateQueries({ queryKey: getListHomeworkQueryKey() });
    queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/homework/") });
  };

  const handleQuality = (quality: Quality) => {
    const targetPage = pageNumber;
    updatePage.mutate(
      { pageNumber: targetPage, data: { quality } },
      {
        onSuccess: () => {
          toast({ title: `Page ${targetPage} marked as ${quality}` });
          invalidateProgressData();
        },
        onError: () => toast({ title: "Failed to record recitation", variant: "destructive" }),
      }
    );
  };

  const handleSubmitInput = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseInt(pageInput, 10);
    if (!Number.isNaN(n)) goToPage(n);
  };

  const closeSheetAndGo = (page: number) => {
    setSheetOpen(false);
    setSurahSearch("");
    goToPage(page);
  };

  const currentQuality = (currentPage?.quality ?? null) as Quality | null;
  const lastRecitedLabel = currentPage?.lastRecited
    ? format(new Date(currentPage.lastRecited), "MMM d, yyyy")
    : null;

  return (
    <div className="space-y-4 max-w-4xl mx-auto" data-testid="reader-page">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold">Quran Reader</h2>
          <p className="text-sm text-muted-foreground mt-1">
            One page at a time. Use arrow keys, the buttons below, or jump to any surah.
          </p>
        </div>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" data-testid="btn-open-jump">
              <BookMarked className="w-4 h-4 mr-1.5" />
              Jump to Surah
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
            <SheetHeader className="p-4 border-b shrink-0">
              <SheetTitle>Jump to Surah</SheetTitle>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search by name, Arabic, or number..."
                  value={surahSearch}
                  onChange={e => setSurahSearch(e.target.value)}
                  className="pl-9"
                  data-testid="reader-surah-search"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground text-left mt-1">
                Tap a surah name to jump to its first page, or tap any page chip to jump there directly.
              </p>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto divide-y" data-testid="reader-surah-list">
              {filteredSurahs.map(s => {
                const surahPages: number[] = [];
                for (let p = s.startPage; p <= s.endPage; p++) surahPages.push(p);
                return (
                  <div key={s.number} className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => closeSheetAndGo(s.startPage)}
                      className="w-full flex items-start justify-between gap-2 text-left rounded-md hover:bg-muted/50 -mx-2 px-2 py-1 transition-colors"
                      data-testid={`reader-surah-${s.number}`}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0 mt-0.5">
                          {s.number}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{s.name}</span>
                            <span className="text-sm font-serif text-muted-foreground" dir="rtl" lang="ar">{s.arabic}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {surahPages.length === 1 ? `Page ${s.startPage}` : `Pages ${s.startPage}–${s.endPage} (${surahPages.length})`}
                          </div>
                        </div>
                      </div>
                    </button>
                    {surahPages.length > 1 && (
                      <div className="flex flex-wrap gap-1 mt-2 ml-9">
                        {surahPages.map(p => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => closeSheetAndGo(p)}
                            className={`text-[11px] px-2 py-0.5 rounded border font-medium transition-colors ${
                              p === pageNumber
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            }`}
                            data-testid={`reader-surah-${s.number}-page-${p}`}
                            aria-label={`Jump to page ${p}`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredSurahs.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  No surahs match "{surahSearch}".
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <Card className="border shadow-sm">
        <CardContent className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-2xl font-bold tabular-nums shrink-0" data-testid="reader-current-page">
              {pageNumber}
              <span className="text-sm font-normal text-muted-foreground"> / {TOTAL_PAGES}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap text-sm">
                {arabicName && (
                  <span className="font-serif" dir="rtl" lang="ar" data-testid="reader-page-name">
                    {arabicName}
                  </span>
                )}
                <span className="text-muted-foreground text-xs">
                  Juz {juzNumber} · Part {rob3} ({partInJuz}/8)
                </span>
              </div>
              <div className="flex flex-wrap gap-1 mt-1">
                {surahsOnPage.map(s => (
                  <span
                    key={s.number}
                    className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground"
                    data-testid={`reader-surah-tag-${s.number}`}
                  >
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pagesLoading ? (
              <Skeleton className="h-6 w-20 rounded" />
            ) : currentPage?.quality ? (
              <QualityBadge quality={currentPage.quality} />
            ) : null}
            {currentPage && <StatusBadge status={currentPage.status} />}
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm overflow-hidden">
        <div className="bg-stone-50 dark:bg-stone-900/40 min-h-[60vh] p-4 sm:p-8">
          {ayahsLoading ? (
            <div className="space-y-3" data-testid="reader-loading">
              <Skeleton className="h-6 w-1/2 mx-auto" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-11/12" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-10/12" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-9/12" />
            </div>
          ) : ayahsError ? (
            <div className="flex flex-col items-center justify-center text-center text-muted-foreground py-12 px-4" data-testid="reader-load-error">
              <AlertCircle className="w-10 h-10 mb-3 opacity-50" />
              <p className="text-sm font-medium text-foreground">Couldn't load page text</p>
              <p className="text-xs mt-1">
                The Quran text service is unreachable right now. Navigation and marking still work.
              </p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => void refetchAyahs()}>
                Try again
              </Button>
              {arabicName && (
                <p className="text-xl font-serif mt-6" dir="rtl" lang="ar">{arabicName}</p>
              )}
            </div>
          ) : (
            <div dir="rtl" lang="ar" className="space-y-6" data-testid="reader-page-text">
              {groupedAyahs.map((group, idx) => (
                <div key={`${group.surahNumber}-${idx}`} className="space-y-3">
                  {group.isFirstAyah && (
                    <div className="text-center py-2 border-y border-stone-300/60 dark:border-stone-700/60 bg-stone-100/60 dark:bg-stone-800/30 rounded">
                      <div className="font-serif text-lg" dir="rtl" lang="ar">
                        سورة {SURAHS.find(s => s.number === group.surahNumber)?.arabic ?? group.surahName}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                        {group.surahName} · Surah {group.surahNumber}
                      </div>
                    </div>
                  )}
                  <p className="font-serif text-2xl sm:text-3xl leading-loose text-justify" style={{ wordSpacing: "0.1em" }}>
                    {group.ayahs.map((a, i) => (
                      <span key={a.number}>
                        {/* Strip the leading bismillah from Al-Fatiha:1 and other surah-opening bismillahs since the API includes them inline */}
                        {a.text.replace(/^\ufeff?بِسْمِ\s+اللَّهِ\s+الرَّحْمَ?ٰ?نِ\s+الرَّحِيمِ\s*/u, group.isFirstAyah && i === 0 && group.surahNumber !== 1 ? "" : "$&")}
                        <span className="inline-flex items-center justify-center mx-1 w-7 h-7 text-xs rounded-full border border-stone-400/60 text-stone-600 dark:text-stone-300 align-middle font-sans" aria-hidden="true">
                          {arabicNumeral(a.numberInSurah)}
                        </span>
                        {i < group.ayahs.length - 1 ? " " : ""}
                      </span>
                    ))}
                  </p>
                </div>
              ))}
              {groupedAyahs.length === 0 && (
                <p className="text-center text-sm text-muted-foreground" dir="ltr">No ayahs returned for this page.</p>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card className="border shadow-sm">
        <CardContent className="px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(pageNumber - 1)}
              disabled={pageNumber <= 1}
              data-testid="btn-prev-page"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Previous
            </Button>

            <form onSubmit={handleSubmitInput} className="flex items-center gap-2">
              <label htmlFor="reader-page-input" className="text-xs text-muted-foreground">
                Go to
              </label>
              <Input
                id="reader-page-input"
                type="number"
                min={1}
                max={TOTAL_PAGES}
                value={pageInput}
                onChange={e => setPageInput(e.target.value)}
                className="w-20 h-8 text-sm text-center"
                data-testid="reader-page-input"
              />
              <Button type="submit" size="sm" variant="secondary" data-testid="btn-go-page">
                Go
              </Button>
            </form>

            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(pageNumber + 1)}
              disabled={pageNumber >= TOTAL_PAGES}
              data-testid="btn-next-page"
            >
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="text-sm font-medium">Mark this page as recited</div>
              {lastRecitedLabel && (
                <div className="text-xs text-muted-foreground" data-testid="reader-last-recited">
                  Last recited: {lastRecitedLabel}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {QUALITIES.map(({ value, label }) => {
                const isActive = currentQuality === value;
                const style = qualityStyle[value];
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleQuality(value)}
                    disabled={updatePage.isPending}
                    className={`flex-1 min-w-[72px] px-3 py-2 rounded-md border text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                      isActive ? style.active : `border-border bg-background text-muted-foreground ${style.hover}`
                    } disabled:opacity-50`}
                    data-testid={`reader-quality-${value}`}
                    aria-label={`Mark page ${pageNumber} as ${label}`}
                    aria-pressed={isActive}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {currentPage && !currentPage.inScope && currentQuality === null && (
              <p className="text-[11px] text-muted-foreground mt-2">
                Not in your memorization scope yet — marking a quality will add it automatically.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
