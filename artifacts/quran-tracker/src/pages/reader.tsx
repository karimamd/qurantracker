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
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { QualityBadge, StatusBadge } from "@/components/quality-badge";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, BookMarked, Search, AlertCircle, Eye, EyeOff, Check, X, ChevronsLeft } from "lucide-react";
import { format } from "date-fns";
import { SURAHS, JUZ_RANGES, ALL_ROB3S, TOTAL_PAGES } from "@/lib/quran-ref";
import { getDefaultPageName } from "@/lib/page-names";
import { type Quality, QUALITIES, qualityStyle } from "@/lib/quality";
import { usePageAyahs, usePrefetchPageAyahs, type ApiAyah } from "@/hooks/use-page-ayahs";

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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [surahSearch, setSurahSearch] = useState("");

  // Hide-and-reveal practice mode state (resets on every page change)
  const [hideMode, setHideMode] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const [mistakeAyahs, setMistakeAyahs] = useState<Set<number>>(new Set());
  const [clearedAyahs, setClearedAyahs] = useState<Set<number>>(new Set());

  const { data: allPages, isLoading: pagesLoading } = useListPageProgress({});
  const updatePage = useUpdatePageProgress();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    data: ayahs,
    isLoading: ayahsLoading,
    isError: ayahsError,
    refetch: refetchAyahs,
  } = usePageAyahs(pageNumber);
  const prefetchPageAyahs = usePrefetchPageAyahs();

  // URL -> state sync (only when user navigates browser back/forward)
  useEffect(() => {
    if (!params.page) return;
    const n = clampPage(parseInt(params.page, 10));
    setPageNumber(prev => (prev === n ? prev : n));
  }, [params.page]);

  // Reset practice-mode state whenever the page changes
  useEffect(() => {
    setHideMode(false);
    setRevealedCount(0);
    setMistakeAyahs(new Set());
    setClearedAyahs(new Set());
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
    prefetchPageAyahs(pageNumber + 1);
  }, [pageNumber, prefetchPageAyahs]);

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

  const totalAyahs = ayahs?.length ?? 0;

  // Map global ayah.number -> its 0-based position on this page (for hide-mode visibility check)
  const ayahIndexMap = useMemo(() => {
    const m = new Map<number, number>();
    ayahs?.forEach((a, i) => m.set(a.number, i));
    return m;
  }, [ayahs]);

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
    const mistakes = mistakeAyahs.size;
    updatePage.mutate(
      { pageNumber: targetPage, data: mistakes > 0 ? { quality, mistakes } : { quality } },
      {
        onSuccess: () => {
          toast({
            title: `Page ${targetPage} marked as ${quality}${mistakes > 0 ? ` (${mistakes} mistake${mistakes === 1 ? "" : "s"})` : ""}`,
          });
          invalidateProgressData();
          // Only clear practice-mode session state if the user is still on the same page.
          // Otherwise (user navigated away mid-flight), the page-change effect already reset state and we'd risk wiping a fresh page's marks.
          setPageNumber(currentPage => {
            if (currentPage === targetPage) {
              setMistakeAyahs(new Set());
              setClearedAyahs(new Set());
            }
            return currentPage;
          });
        },
        onError: () => toast({ title: "Failed to record recitation", variant: "destructive" }),
      }
    );
  };

  const startHideMode = () => {
    setHideMode(true);
    setRevealedCount(0);
    setMistakeAyahs(new Set());
    setClearedAyahs(new Set());
  };

  const showAllAyahs = () => {
    setHideMode(false);
  };

  const showNextAyah = () => {
    setRevealedCount(c => Math.min(c + 1, totalAyahs));
  };

  const resetPractice = () => {
    setRevealedCount(0);
    setMistakeAyahs(new Set());
    setClearedAyahs(new Set());
  };

  const handleAyahMark = (ayahNumber: number, mark: "clear" | "mistake", isLatest: boolean) => {
    if (mark === "clear") {
      setClearedAyahs(prev => {
        const next = new Set(prev);
        next.add(ayahNumber);
        return next;
      });
      setMistakeAyahs(prev => {
        if (!prev.has(ayahNumber)) return prev;
        const next = new Set(prev);
        next.delete(ayahNumber);
        return next;
      });
    } else {
      setMistakeAyahs(prev => {
        const next = new Set(prev);
        next.add(ayahNumber);
        return next;
      });
      setClearedAyahs(prev => {
        if (!prev.has(ayahNumber)) return prev;
        const next = new Set(prev);
        next.delete(ayahNumber);
        return next;
      });
    }
    if (hideMode && isLatest && revealedCount < totalAyahs) {
      setRevealedCount(c => c + 1);
    }
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
        <CardContent className="px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-base font-semibold tabular-nums shrink-0" data-testid="reader-current-page">
              {pageNumber}
              <span className="text-xs font-normal text-muted-foreground"> / {TOTAL_PAGES}</span>
            </div>
            {arabicName && (
              <span className="font-serif text-sm" dir="rtl" lang="ar" data-testid="reader-page-name">
                {arabicName}
              </span>
            )}
            <span className="text-muted-foreground text-[11px]">
              Juz {juzNumber} · Part {rob3} ({partInJuz}/8)
            </span>
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
          <div className="flex items-center gap-1.5 shrink-0">
            {pagesLoading ? (
              <Skeleton className="h-5 w-16 rounded" />
            ) : currentPage?.quality ? (
              <QualityBadge quality={currentPage.quality} />
            ) : null}
            {currentPage && <StatusBadge status={currentPage.status} />}
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm overflow-hidden">
        {ayahs && !ayahsError && (
          <div className="border-b bg-background px-3 py-2 flex items-center justify-between gap-2 flex-wrap" data-testid="reader-practice-toolbar">
            <div className="flex items-center gap-2 flex-wrap">
              {!hideMode ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={startHideMode}
                  data-testid="btn-hide-all"
                >
                  <EyeOff className="w-4 h-4 mr-1.5" />
                  Hide all ayahs
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={showAllAyahs}
                    data-testid="btn-show-all"
                  >
                    <Eye className="w-4 h-4 mr-1.5" />
                    Show all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={resetPractice}
                    data-testid="btn-reset-practice"
                    title="Re-hide all and clear marks"
                  >
                    <ChevronsLeft className="w-4 h-4 mr-1" />
                    Restart
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums" data-testid="reader-revealed-count">
                    {revealedCount} / {totalAyahs} ayah{totalAyahs === 1 ? "" : "s"} revealed
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {mistakeAyahs.size > 0 && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200"
                  data-testid="reader-mistake-count"
                  title="Mistakes will be recorded with your next quality rating"
                >
                  {mistakeAyahs.size} mistake{mistakeAyahs.size === 1 ? "" : "s"}
                </span>
              )}
              {clearedAyahs.size > 0 && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200"
                  data-testid="reader-cleared-count"
                >
                  {clearedAyahs.size} clear
                </span>
              )}
            </div>
          </div>
        )}
        <div className="bg-[#f4ecd8] text-stone-900 dark:bg-stone-900/60 dark:text-stone-100 min-h-[60vh] p-4 sm:p-8">
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
                    <div className="text-center py-2 border-y border-stone-400/40 dark:border-stone-700/60 bg-[#ead9b5]/60 dark:bg-stone-800/30 rounded">
                      <div className="font-serif text-lg" dir="rtl" lang="ar">
                        سورة {SURAHS.find(s => s.number === group.surahNumber)?.arabic ?? group.surahName}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                        {group.surahName} · Surah {group.surahNumber}
                      </div>
                    </div>
                  )}
                  <p className="font-serif text-2xl sm:text-3xl leading-loose text-justify" style={{ wordSpacing: "0.1em" }}>
                    {group.ayahs.map((a, i) => {
                      const globalIndex = ayahIndexMap.get(a.number) ?? 0;
                      const isVisible = !hideMode || globalIndex < revealedCount;
                      const isLatest = hideMode && globalIndex === revealedCount - 1;
                      const isMistake = mistakeAyahs.has(a.number);
                      const isClear = clearedAyahs.has(a.number);
                      const trailingSpace = i < group.ayahs.length - 1 ? " " : "";

                      if (!isVisible) {
                        return (
                          <span key={a.number} className="inline-flex items-center align-middle mx-0.5" data-testid={`reader-ayah-hidden-${a.number}`}>
                            <span className="inline-block h-1.5 w-16 sm:w-24 bg-stone-300/70 dark:bg-stone-700/70 rounded-full" />
                            <span className="inline-flex items-center justify-center mx-1 w-7 h-7 text-xs rounded-full border border-dashed border-stone-400/50 text-stone-400 align-middle font-sans">
                              {arabicNumeral(a.numberInSurah)}
                            </span>
                            <span className="inline-block h-1.5 w-8 bg-stone-300/70 dark:bg-stone-700/70 rounded-full" />
                            {trailingSpace}
                          </span>
                        );
                      }

                      const cleanedText = a.text.replace(
                        /^\ufeff?بِسْمِ\s+اللَّهِ\s+الرَّحْمَ?ٰ?نِ\s+الرَّحِيمِ\s*/u,
                        group.isFirstAyah && i === 0 && group.surahNumber !== 1 ? "" : "$&",
                      );

                      return (
                        <span
                          key={a.number}
                          className={
                            isMistake
                              ? "text-rose-600 dark:text-rose-400"
                              : isLatest
                              ? "bg-amber-100/40 dark:bg-amber-500/10 rounded px-0.5"
                              : ""
                          }
                          data-testid={`reader-ayah-${a.number}`}
                        >
                          {cleanedText}
                          <span
                            className={`inline-flex items-center justify-center mx-1 w-7 h-7 text-xs rounded-full border align-middle font-sans ${
                              isMistake
                                ? "border-rose-400 bg-rose-100 text-rose-700"
                                : isClear
                                ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                                : "border-stone-400/60 text-stone-600 dark:text-stone-300"
                            }`}
                            aria-hidden="true"
                          >
                            {arabicNumeral(a.numberInSurah)}
                          </span>
                          {hideMode && (
                            <span className="inline-flex items-center gap-0.5 mx-1 align-middle" dir="ltr">
                              <button
                                type="button"
                                onClick={() => handleAyahMark(a.number, "clear", isLatest)}
                                className={`w-6 h-6 inline-flex items-center justify-center rounded border text-xs transition-colors ${
                                  isClear
                                    ? "bg-emerald-500 border-emerald-500 text-white"
                                    : "border-border bg-background text-muted-foreground hover:text-emerald-700 hover:border-emerald-300"
                                }`}
                                title={isLatest ? "Clear (reveals next)" : "Mark clear"}
                                aria-label={`Mark ayah ${a.numberInSurah} as clear`}
                                aria-pressed={isClear}
                                data-testid={`reader-ayah-clear-${a.number}`}
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAyahMark(a.number, "mistake", isLatest)}
                                className={`w-6 h-6 inline-flex items-center justify-center rounded border text-xs transition-colors ${
                                  isMistake
                                    ? "bg-rose-500 border-rose-500 text-white"
                                    : "border-border bg-background text-muted-foreground hover:text-rose-700 hover:border-rose-300"
                                }`}
                                title={isLatest ? "Mistake (reveals next)" : "Mark mistake"}
                                aria-label={`Mark ayah ${a.numberInSurah} as mistake`}
                                aria-pressed={isMistake}
                                data-testid={`reader-ayah-mistake-${a.number}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          )}
                          {trailingSpace}
                        </span>
                      );
                    })}
                  </p>
                </div>
              ))}
              {groupedAyahs.length === 0 && (
                <p className="text-center text-sm text-muted-foreground" dir="ltr">No ayahs returned for this page.</p>
              )}

              {hideMode && revealedCount < totalAyahs && (
                <div className="pt-4 flex justify-center" dir="ltr">
                  <Button
                    type="button"
                    size="lg"
                    onClick={showNextAyah}
                    data-testid="btn-show-next-ayah"
                    className="shadow-md"
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Show next ayah
                    <span className="ml-2 text-xs font-normal opacity-80">({revealedCount + 1} / {totalAyahs})</span>
                  </Button>
                </div>
              )}
              {hideMode && revealedCount >= totalAyahs && totalAyahs > 0 && (
                <div className="pt-4 text-center text-sm text-muted-foreground" dir="ltr" data-testid="reader-all-revealed">
                  All ayahs revealed. Pick a quality rating below to record this recitation
                  {mistakeAyahs.size > 0 ? ` along with ${mistakeAyahs.size} mistake${mistakeAyahs.size === 1 ? "" : "s"}.` : "."}
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card className="border shadow-sm">
        <CardContent className="px-4 py-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            {/* Arabic reads right-to-left, so Next is on the left and Previous is on the right. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(pageNumber + 1)}
              disabled={pageNumber >= TOTAL_PAGES}
              data-testid="btn-next-page"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Next
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(pageNumber - 1)}
              disabled={pageNumber <= 1}
              data-testid="btn-prev-page"
            >
              Previous
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
