/**
 * Reader page (/reader, /reader/:page).
 *
 * The single most interactive screen: lays out a Mushaf page's ayahs in
 * traditional RTL with tap-to-mark mistake interaction.
 *
 * Data flow:
 *   - Ayah text comes from usePageAyahs (IndexedDB → bundled dump → API).
 *   - Page state (quality, dueDate, customName, scope) comes from
 *     useListPageProgress in batches; we update via useUpdatePageProgress
 *     which optimistically refreshes the dashboard cache.
 *   - Active per-ayah mistakes (memorization vs link) are managed by the
 *     useListActivePageMistakes / useAddActivePageMistake /
 *     useRemoveActivePageMistake trio. The server advisory-locks each
 *     mutation so rapid double-taps can't double-insert.
 *
 * URL params:
 *   - :page (1..604) — selected page
 *   - ?practice=<globalAyah> — opens with a specific ayah focused, used by
 *     the /mistakes page deep-link
 */
import {
  useListPageProgress,
  useUpdatePageProgress,
  useListActivePageMistakes,
  useAddActivePageMistake,
  useRemoveActivePageMistake,
  useClearAllActivePageMistakes,
  useRecordTelawaRead,
  useStartKhatmah,
  useGetTelawaToday,
  useListHomework,
  useGetHomework,
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
  getGetTelawaTodayQueryKey,
  getGetTelawaStatsQueryKey,
  getListPageProgressQueryKey,
  getGetProgressOverviewQueryKey,
  getListJuzProgressQueryKey,
  getListSurahProgressQueryKey,
  getListRob3ProgressQueryKey,
  getGetRecentActivityQueryKey,
  getGetJuzDetailQueryKey,
  getGetSurahDetailQueryKey,
  getListHomeworkQueryKey,
  getGetMistakesQueryKey,
  getListActivePageMistakesQueryKey,
  getGetHomeworkQueryKey,
} from "@workspace/api-client-react";
import type { PageProgress, ActiveAyahMistake } from "@workspace/api-client-react";
import { isOfflineQueued } from "@workspace/api-client-react";
import { useParams, useLocation, useSearch } from "wouter";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { QualityBadge, StatusBadge } from "@/components/quality-badge";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, ChevronRight, BookMarked, Search, AlertCircle, Eye, EyeOff, Check, X, ChevronsLeft, Link2, Repeat, Sparkles, Minus, Plus, Eraser, BookOpen, ClipboardList, ArrowUpRight } from "lucide-react";
import { format } from "date-fns";
import { SURAHS, JUZ_RANGES, ALL_ROB3S, TOTAL_PAGES } from "@/lib/quran-ref";
import { getDefaultPageName } from "@/lib/page-names";
import { type Quality, QUALITIES, qualityStyle } from "@/lib/quality";
import { usePageAyahs, usePrefetchPageAyahs, type ApiAyah } from "@/hooks/use-page-ayahs";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const params = useParams<{ page?: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const practiceTargetGlobal = useMemo(() => {
    const sp = new URLSearchParams(search);
    const v = sp.get("practice");
    if (!v) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [search]);
  const practiceAppliedRef = useRef<string | null>(null);
  const LAST_PAGE_KEY = "qt_reader_last_page";
  const initialPage = clampPage(
    params.page
      ? parseInt(params.page, 10)
      : parseInt(localStorage.getItem(LAST_PAGE_KEY) ?? "1", 10),
  );

  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [surahSearch, setSurahSearch] = useState("");

  // Hide-and-reveal practice mode state (resets on every page change)
  const [hideMode, setHideMode] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const [mistakeAyahs, setMistakeAyahs] = useState<Set<number>>(new Set());
  const [clearedAyahs, setClearedAyahs] = useState<Set<number>>(new Set());
  const [linkAyahs, setLinkAyahs] = useState<Set<number>>(new Set());
  // In "Show all" view, clicking an ayah selects it and reveals its mark
  // buttons (clear / mistake / link). Click again to deselect.
  const [selectedAyahShowAll, setSelectedAyahShowAll] = useState<number | null>(null);

  const { data: allPages, isLoading: pagesLoading } = useListPageProgress({});
  const updatePage = useUpdatePageProgress();
  const { data: activeMistakes } = useListActivePageMistakes(pageNumber);
  const addActiveMistake = useAddActivePageMistake();
  const removeActiveMistake = useRemoveActivePageMistake();
  const clearAllMistakes = useClearAllActivePageMistakes();
  const recordTelawaRead = useRecordTelawaRead();
  const startKhatmah = useStartKhatmah();
  const queryClient = useQueryClient();

  // Context badges — is this page part of today's Telawa batch or an active homework?
  const { data: telawaToday } = useGetTelawaToday();
  const { data: homeworkSessions } = useListHomework();
  const activeHomeworkId = homeworkSessions?.find(s => s.status === "active")?.id ?? null;
  const { data: activeHomeworkDetail } = useGetHomework(activeHomeworkId ?? 0, {
    query: { enabled: activeHomeworkId !== null, queryKey: getGetHomeworkQueryKey(activeHomeworkId ?? 0) },
  });
  const isTelawaPage = telawaToday?.upcomingPages.includes(pageNumber) ?? false;
  const homeworkItem = activeHomeworkDetail?.items.find(item => item.pageNumber === pageNumber) ?? null;
  const { toast } = useToast();

  const invalidateTelawa = () => {
    queryClient.invalidateQueries({ queryKey: getGetTelawaTodayQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTelawaStatsQueryKey() });
  };

  const handleMarkTelawa = () => {
    recordTelawaRead.mutate(
      { data: { pageNumber } },
      {
        onSuccess: () => {
          invalidateTelawa();
          toast({ title: t("reader.telawaMarked", { page: pageNumber }) });
          if (pageNumber < TOTAL_PAGES) goToPage(pageNumber + 1);
        },
        onError: (err) => {
          if (isOfflineQueued(err)) { toast({ title: t("offline.savedLocally") }); return; }
          toast({ title: t("telawa.recordFailed"), variant: "destructive" });
        },
      },
    );
  };

  const handleStartKhatmahHere = () => {
    startKhatmah.mutate(
      { data: { startPage: pageNumber } },
      {
        onSuccess: () => {
          invalidateTelawa();
          toast({ title: t("reader.khatmahStarted", { page: pageNumber }) });
        },
        onError: () =>
          toast({ title: t("telawa.khatmah.startFailed"), variant: "destructive" }),
      },
    );
  };

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

  // Reset only transient UI on page change — reveal progress and the
  // currently-selected ayah. mistakeAyahs / linkAyahs / clearedAyahs are
  // ALL server-persisted now and re-seeded by the effect below whenever
  // the active-mistakes query result changes; resetting them here would
  // briefly clear the marks before the seed effect re-applies them.
  useEffect(() => {
    setRevealedCount(0);
    setSelectedAyahShowAll(null);
  }, [pageNumber]);

  // Clear show-all selection when entering hide mode (where buttons are
  // always visible per-ayah and selection has no meaning).
  useEffect(() => {
    if (hideMode) setSelectedAyahShowAll(null);
  }, [hideMode]);

  // Seed mistake / link / cleared marks from the server's persisted "active"
  // set so they remain visible across navigation, refresh, and even fresh
  // sessions until the user explicitly reverses them in the reader. The
  // server enforces that cleared is mutually exclusive with memorization /
  // link on the same ayah, so the three sets here will never overlap.
  useEffect(() => {
    if (!activeMistakes) return;
    const m = new Set<number>();
    const l = new Set<number>();
    const c = new Set<number>();
    for (const am of activeMistakes as ActiveAyahMistake[]) {
      if (am.mistakeType === "memorization") m.add(am.globalAyahNumber);
      else if (am.mistakeType === "link") l.add(am.globalAyahNumber);
      else if (am.mistakeType === "cleared") c.add(am.globalAyahNumber);
    }
    setMistakeAyahs(m);
    setLinkAyahs(l);
    setClearedAyahs(c);
  }, [activeMistakes]);

  // Apply ?practice=<globalAyahNumber> — auto-enter hide-mode at the target ayah and scroll to it.
  useEffect(() => {
    if (practiceTargetGlobal == null || !ayahs || ayahs.length === 0) return;
    const key = `${pageNumber}|${practiceTargetGlobal}`;
    if (practiceAppliedRef.current === key) return;
    const idx = ayahs.findIndex(a => a.number === practiceTargetGlobal);
    if (idx === -1) return;
    practiceAppliedRef.current = key;
    setHideMode(true);
    setRevealedCount(idx); // hide the target so the user can practice predicting it
    // Don't reset mistake / link / cleared sets — all three are persisted.
    // Scroll the target placeholder/highlight into view shortly after render
    setTimeout(() => {
      const el = document.querySelector(
        `[data-testid="reader-ayah-hidden-${practiceTargetGlobal}"], [data-testid="reader-ayah-${practiceTargetGlobal}"]`
      );
      if (el && "scrollIntoView" in el) {
        (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
  }, [practiceTargetGlobal, ayahs, pageNumber]);

  useEffect(() => {
    localStorage.setItem(LAST_PAGE_KEY, String(pageNumber));
  }, [pageNumber]);

  const goToPage = (n: number) => {
    const clamped = clampPage(n);
    if (clamped === pageNumber) return;
    setPageNumber(clamped);
    setLocation(`/reader/${clamped}`);
    // Reset scroll to the top so the reader always starts at the first
    // ayah of the new page instead of inheriting the previous page's
    // scroll offset (which forced the user to scroll back up manually).
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
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
    const linkCount = linkAyahs.size;
    // Per-ayah marks are persisted instantly via /active-mistakes endpoints,
    // so we no longer ship them here. We still send the aggregate `mistakes`
    // count so the page-level stats stay accurate.
    const data: { quality: Quality; mistakes?: number } = { quality };
    if (mistakes > 0) data.mistakes = mistakes;
    updatePage.mutate(
      { pageNumber: targetPage, data },
      {
        onSuccess: () => {
          const parts: string[] = [];
          if (mistakes > 0) parts.push(t("reader.mistakes", { count: mistakes }));
          if (linkCount > 0) parts.push(t("reader.linkIssuesShort", { count: linkCount }));
          toast({
            title: parts.length
              ? t("reader.markedToastWith", { page: targetPage, quality: t(`quality.${quality}`), detail: parts.join(", ") })
              : t("reader.markedToast", { page: targetPage, quality: t(`quality.${quality}`) }),
          });
          invalidateProgressData();
          queryClient.invalidateQueries({ queryKey: getGetMistakesQueryKey() });
          // mistake / link / cleared marks are all persistent now and stay
          // visible until the user explicitly reverses them in the reader.
        },
        onError: (err) => {
          if (isOfflineQueued(err)) { toast({ title: t("offline.savedLocally") }); return; }
          toast({ title: t("reader.recordFailed"), variant: "destructive" });
        },
      }
    );
  };

  const startHideMode = () => {
    setHideMode(true);
    setRevealedCount(0);
  };

  const showAllAyahs = () => {
    setHideMode(false);
  };

  const showNextAyah = () => {
    setRevealedCount(c => Math.min(c + 1, totalAyahs));
  };

  const resetPractice = () => {
    setRevealedCount(0);
  };

  // Find the ayah's surah/numberInSurah from the loaded page so the server
  // can persist a complete row.
  const ayahMeta = (globalAyahNumber: number) => {
    const a = ayahs?.find(x => x.number === globalAyahNumber);
    if (!a) return null;
    return { surahNumber: a.surah.number, ayahNumberInSurah: a.numberInSurah };
  };

  const persistAdd = (
    globalAyahNumber: number,
    mistakeType: "memorization" | "link" | "cleared",
  ) => {
    const meta = ayahMeta(globalAyahNumber);
    if (!meta) return;
    const targetPage = pageNumber;
    // Cancel any in-flight active-mistakes GET for this page so a slow
    // pre-mutation fetch can't resolve later and overwrite our optimistic
    // (and soon-to-be-authoritative) cache write with stale data. The
    // setQueryData in onSuccess will then be the next thing the seed
    // effect sees.
    queryClient.cancelQueries({ queryKey: getListActivePageMistakesQueryKey(targetPage) });
    addActiveMistake.mutate(
      {
        pageNumber: targetPage,
        data: {
          surahNumber: meta.surahNumber,
          ayahNumberInSurah: meta.ayahNumberInSurah,
          globalAyahNumber,
          mistakeType,
        },
      },
      {
        onSuccess: (data) => {
          // Authoritative server response — write directly to cache so the
          // seeding effect never clobbers optimistic state with stale data.
          queryClient.setQueryData(getListActivePageMistakesQueryKey(targetPage), data);
          // Also refresh the global mistakes feed so /mistakes and the
          // badges on /ayahs reflect this mark without a hard refresh.
          // ("cleared" rows are excluded server-side from that feed, but
          // invalidating is still cheap and keeps the path uniform.)
          queryClient.invalidateQueries({ queryKey: getGetMistakesQueryKey() });
          // The server may have auto-assigned a page recitation as a side
          // effect (when the feature flag is on AND this mark completed the
          // page). We don't know whether that fired without reading the
          // response, so invalidate the progress-derived queries that would
          // surface a freshly written recitation_log / page_progress row.
          invalidateProgressData();
        },
        onError: (err) => {
          // When offline the request is queued — keep local state as-is
          if (isOfflineQueued(err)) { toast({ title: t("offline.savedLocally") }); return; }
          // Roll back optimistic state on a real failure
          if (mistakeType === "memorization") {
            setMistakeAyahs(prev => {
              const n = new Set(prev);
              n.delete(globalAyahNumber);
              return n;
            });
          } else if (mistakeType === "link") {
            setLinkAyahs(prev => {
              const n = new Set(prev);
              n.delete(globalAyahNumber);
              return n;
            });
          } else {
            // mistakeType === "cleared"
            setClearedAyahs(prev => {
              const n = new Set(prev);
              n.delete(globalAyahNumber);
              return n;
            });
          }
          toast({ title: t("reader.markFailed"), variant: "destructive" });
        },
      },
    );
  };

  const persistRemove = (
    globalAyahNumber: number,
    mistakeType: "memorization" | "link" | "cleared",
    rollback: () => void,
  ) => {
    const targetPage = pageNumber;
    // Same rationale as persistAdd: cancel pre-mutation in-flight GETs so
    // they can't overwrite the authoritative onSuccess cache write.
    queryClient.cancelQueries({ queryKey: getListActivePageMistakesQueryKey(targetPage) });
    removeActiveMistake.mutate(
      {
        pageNumber: targetPage,
        data: { globalAyahNumber, mistakeType },
      },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getListActivePageMistakesQueryKey(targetPage), data);
          // Mirror persistAdd: keep /mistakes and the /ayahs badges in
          // sync after a per-ayah toggle.
          queryClient.invalidateQueries({ queryKey: getGetMistakesQueryKey() });
          // Removing a mistake can also flip the auto-assigned bucket
          // server-side (e.g. relearn → hard). Refresh the same set of
          // progress-derived queries persistAdd does.
          invalidateProgressData();
        },
        onError: (err) => {
          if (isOfflineQueued(err)) { toast({ title: t("offline.savedLocally") }); return; }
          rollback();
          toast({ title: t("reader.markFailed"), variant: "destructive" });
        },
      },
    );
  };

  const handleAyahLink = (ayahNumber: number) => {
    const isOn = linkAyahs.has(ayahNumber);
    if (isOn) {
      // Optimistic remove
      setLinkAyahs(prev => {
        const n = new Set(prev);
        n.delete(ayahNumber);
        return n;
      });
      persistRemove(ayahNumber, "link", () => {
        setLinkAyahs(prev => {
          const n = new Set(prev);
          n.add(ayahNumber);
          return n;
        });
      });
    } else {
      setLinkAyahs(prev => {
        const n = new Set(prev);
        n.add(ayahNumber);
        return n;
      });
      // Link is independent of cleared/memorization — do NOT touch either
      // of those sets here. The server no longer auto-resolves them.
      persistAdd(ayahNumber, "link");
    }
  };

  const handleAyahMark = (ayahNumber: number, mark: "clear" | "mistake", isLatest: boolean) => {
    if (mark === "clear") {
      // The tick is a positive overwrite for this ayah: it persists a
      // "cleared" mark and the server atomically resolves any active
      // memorization / link mistakes for the same ayah inside the same
      // transaction. We only need to call persistAdd("cleared") — the
      // single response refreshes the active-mistakes cache, which the
      // seed effect above turns into the final source of truth for the
      // mistake / link / cleared sets.
      const wasCleared = clearedAyahs.has(ayahNumber);
      // Optimistically reflect the new state immediately for snappy UI;
      // the seed effect will reconcile to the server's authoritative set.
      setClearedAyahs(prev => {
        const next = new Set(prev);
        next.add(ayahNumber);
        return next;
      });
      // "cleared" only supersedes "memorization" — leave linkAyahs alone.
      setMistakeAyahs(prev => {
        if (!prev.has(ayahNumber)) return prev;
        const next = new Set(prev);
        next.delete(ayahNumber);
        return next;
      });
      // Skip the network round-trip when the ayah was already cleared on
      // the server — re-posting would be a no-op anyway.
      if (!wasCleared) persistAdd(ayahNumber, "cleared");
    } else {
      const wasMistake = mistakeAyahs.has(ayahNumber);
      if (!wasMistake) {
        setMistakeAyahs(prev => {
          const next = new Set(prev);
          next.add(ayahNumber);
          return next;
        });
        persistAdd(ayahNumber, "memorization");
      }
      // Adding a memorization mistake supersedes any prior "cleared" tick
      // on this ayah — mirror the server's auto-resolve locally.
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

  // Resolve every active mark (mistake / link / cleared) on the current
  // page in one round-trip and reset the local sets immediately so the
  // UI returns to a blank slate without waiting for the seed effect.
  const handleClearAllMarks = () => {
    const targetPage = pageNumber;
    const prevMistakes = mistakeAyahs;
    const prevLinks = linkAyahs;
    const prevCleared = clearedAyahs;
    if (prevMistakes.size === 0 && prevLinks.size === 0 && prevCleared.size === 0) return;
    setMistakeAyahs(new Set());
    setLinkAyahs(new Set());
    setClearedAyahs(new Set());
    queryClient.cancelQueries({ queryKey: getListActivePageMistakesQueryKey(targetPage) });
    clearAllMistakes.mutate(
      { pageNumber: targetPage },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getListActivePageMistakesQueryKey(targetPage), data);
          queryClient.invalidateQueries({ queryKey: getGetMistakesQueryKey() });
          toast({ title: t("reader.clearAllMarksDone", { page: targetPage }) });
        },
        onError: (err) => {
          if (isOfflineQueued(err)) { toast({ title: t("offline.savedLocally") }); return; }
          setMistakeAyahs(prevMistakes);
          setLinkAyahs(prevLinks);
          setClearedAyahs(prevCleared);
          toast({ title: t("reader.clearAllMarksFailed"), variant: "destructive" });
        },
      },
    );
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

  // ─── Reader font size ──────────────────────────────────────────────
  // The Quran page text in the Reader is resizable. The chosen pixel size
  // is persisted on the user's settings row so it carries across pages and
  // devices. We keep a local copy so the +/- buttons feel instant, and
  // debounce the PATCH so a flurry of clicks collapses into one request.
  // Bounds match the OpenAPI schema (14-64) to avoid the server rejecting
  // an out-of-range value.
  const READER_FONT_MIN = 14;
  const READER_FONT_MAX = 64;
  const READER_FONT_STEP = 2;
  const READER_FONT_DEFAULT = 24;
  const { data: settings } = useGetSettings();
  const updateSettings = useUpdateSettings();
  const [readerFontSize, setReaderFontSize] = useState<number>(READER_FONT_DEFAULT);
  const fontSizePersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when settings load or change from elsewhere (e.g.,
  // the Settings page). Only overwrite if the server value differs from
  // what the user is actively editing here.
  useEffect(() => {
    if (settings?.readerFontSize && settings.readerFontSize !== readerFontSize) {
      setReaderFontSize(settings.readerFontSize);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.readerFontSize]);

  // Track the latest pending size separately from the debounce handle so
  // we can flush it on unmount — otherwise a user who clicks "+" then
  // navigates away within the 400ms window would silently lose that
  // final write.
  const pendingFontSize = useRef<number | null>(null);

  const flushFontSize = () => {
    if (fontSizePersistTimer.current) {
      clearTimeout(fontSizePersistTimer.current);
      fontSizePersistTimer.current = null;
    }
    const size = pendingFontSize.current;
    if (size == null) return;
    pendingFontSize.current = null;
    updateSettings.mutate(
      { data: { readerFontSize: size } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        },
      },
    );
  };

  const persistFontSize = (size: number) => {
    pendingFontSize.current = size;
    if (fontSizePersistTimer.current) clearTimeout(fontSizePersistTimer.current);
    fontSizePersistTimer.current = setTimeout(flushFontSize, 400);
  };

  const adjustFontSize = (delta: number) => {
    setReaderFontSize(prev => {
      const next = Math.min(READER_FONT_MAX, Math.max(READER_FONT_MIN, prev + delta));
      if (next !== prev) persistFontSize(next);
      return next;
    });
  };

  // On unmount, flush any pending change rather than just clearing the
  // timer so the last adjustment isn't lost when the user navigates
  // away inside the 400ms debounce window.
  useEffect(() => {
    return () => {
      flushFontSize();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ayahTextStyle: CSSProperties = {
    wordSpacing: "0.1em",
    fontSize: `${readerFontSize}px`,
  };
  const bismillahStyle: CSSProperties = {
    fontSize: `${Math.round(readerFontSize * 1.05)}px`,
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto" data-testid="reader-page">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold">{t("reader.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("reader.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end ms-auto">
          {ayahs && !ayahsError ? (
            <div
              className="inline-flex items-center rounded-md border bg-background"
              dir="ltr"
              data-testid="reader-font-size-controls"
              role="group"
              aria-label={t("reader.fontSize")}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-e-none"
                onClick={() => adjustFontSize(-READER_FONT_STEP)}
                disabled={readerFontSize <= READER_FONT_MIN}
                aria-label={t("reader.fontSizeDecrease")}
                title={t("reader.fontSizeDecrease")}
                data-testid="btn-font-size-decrease"
              >
                <Minus className="w-3.5 h-3.5" />
              </Button>
              <span
                className="px-2 text-xs tabular-nums text-muted-foreground select-none border-x min-w-[3ch] text-center"
                data-testid="reader-font-size-value"
                aria-live="polite"
              >
                {readerFontSize}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 rounded-s-none"
                onClick={() => adjustFontSize(READER_FONT_STEP)}
                disabled={readerFontSize >= READER_FONT_MAX}
                aria-label={t("reader.fontSizeIncrease")}
                title={t("reader.fontSizeIncrease")}
                data-testid="btn-font-size-increase"
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : null}
          {ayahs && !ayahsError ? (
            !hideMode ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={startHideMode}
                data-testid="btn-hide-all"
              >
                <EyeOff className="w-4 h-4 me-1.5" />
                {t("reader.hideAll")}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={showAllAyahs}
                data-testid="btn-show-all"
              >
                <Eye className="w-4 h-4 me-1.5" />
                {t("reader.showAll")}
              </Button>
            )
          ) : null}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" data-testid="btn-open-jump">
                <BookMarked className="w-4 h-4 me-1.5" />
                {t("reader.jumpToSurah")}
              </Button>
            </SheetTrigger>
          <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
            <SheetHeader className="p-4 border-b shrink-0">
              <SheetTitle>{t("reader.jumpToSurah")}</SheetTitle>
              <div className="relative mt-2">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder={t("reader.searchSurah")}
                  value={surahSearch}
                  onChange={e => setSurahSearch(e.target.value)}
                  className="ps-9"
                  data-testid="reader-surah-search"
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground text-start mt-1">{t("reader.jumpToSurahHint")}</p>
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
                      className="w-full flex items-start justify-between gap-2 text-start rounded-md hover:bg-muted/50 -mx-2 px-2 py-1 transition-colors"
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
                            {surahPages.length === 1
                              ? t("reader.pageSinglePage", { n: s.startPage })
                              : t("reader.pageRangeShort", { start: s.startPage, end: s.endPage, count: surahPages.length })}
                          </div>
                        </div>
                      </div>
                    </button>
                    {surahPages.length > 1 && (
                      <div className="flex flex-wrap gap-1 mt-2 ms-9">
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
                            aria-label={t("reader.ariaJumpPage", { n: p })}
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
                  {t("reader.noSurahMatch", { q: surahSearch })}
                </div>
              )}
            </div>
          </SheetContent>
          </Sheet>
        </div>
      </div>

      <Card className="border shadow-sm">
        <CardContent className="px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            {/* Compact prev/next pair so the user can change pages from the
                top of the reader without scrolling down to the bottom nav.
                Mirrors the bottom buttons: in RTL Quran flow, Next sits on
                the left (lower-numbered chevron) and Previous on the right. */}
            <div className="flex items-center gap-0.5 shrink-0" data-testid="reader-top-nav">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => goToPage(pageNumber + 1)}
                disabled={pageNumber >= TOTAL_PAGES}
                className="h-7 w-7"
                aria-label={t("reader.next")}
                title={t("reader.next")}
                data-testid="btn-top-next-page"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => goToPage(pageNumber - 1)}
                disabled={pageNumber <= 1}
                className="h-7 w-7"
                aria-label={t("reader.previous")}
                title={t("reader.previous")}
                data-testid="btn-top-prev-page"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-base font-semibold tabular-nums shrink-0" data-testid="reader-current-page">
              {pageNumber}
              <span className="text-xs font-normal text-muted-foreground"> / {TOTAL_PAGES}</span>
            </div>
            {arabicName && (
              <span className="font-serif text-sm truncate max-w-[40vw]" dir="rtl" lang="ar" data-testid="reader-page-name">
                {arabicName}
              </span>
            )}
            <span className="text-muted-foreground text-[11px] shrink-0">
              {t("reader.juzPart", { juz: juzNumber, rob3, idx: partInJuz })}
            </span>
            {surahsOnPage.map(s => (
              <span
                key={s.number}
                className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0"
                data-testid={`reader-surah-tag-${s.number}`}
              >
                {s.name}
              </span>
            ))}
            {pagesLoading ? (
              <Skeleton className="h-5 w-16 rounded" />
            ) : currentPage?.quality ? (
              <QualityBadge quality={currentPage.quality} effectiveQuality={currentPage.effectiveQuality} qualityDowngrades={currentPage.qualityDowngrades} />
            ) : null}
            {currentPage && <StatusBadge status={currentPage.status} />}
            {isTelawaPage && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800 shrink-0" data-testid="reader-badge-telawa">
                <BookOpen className="w-3 h-3" />
                {t("reader.badgeTelawa")}
              </span>
            )}
            {homeworkItem && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 shrink-0" data-testid="reader-badge-homework">
                <ClipboardList className="w-3 h-3" />
                {t(`reader.badgeHomework${homeworkItem.type === "memorize" ? "Memorize" : "Revise"}`)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end ms-auto">
            {(mistakeAyahs.size > 0 || linkAyahs.size > 0 || clearedAyahs.size > 0) && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAllMarks}
                disabled={clearAllMistakes.isPending}
                title={t("reader.clearAllMarksTitle")}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/50"
                data-testid="btn-clear-all-marks"
              >
                <Eraser className="w-3.5 h-3.5 me-1" />
                {t("reader.clearAllMarks")}
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={handleStartKhatmahHere}
              disabled={startKhatmah.isPending}
              data-testid="reader-start-khatmah"
              title={t("reader.startKhatmahTitle")}
              className="h-7 px-2 text-xs text-primary hover:bg-primary/10"
            >
              <Sparkles className="w-3.5 h-3.5 me-1" />
              {t("reader.startKhatmah")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border shadow-sm overflow-hidden">
        {ayahs && !ayahsError && (hideMode || mistakeAyahs.size > 0 || linkAyahs.size > 0) && (
          <div className="border-b bg-background px-3 py-2 flex items-center justify-between gap-2 flex-wrap" data-testid="reader-practice-toolbar">
            <div className="flex items-center gap-2 flex-wrap">
              {hideMode && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={resetPractice}
                    data-testid="btn-reset-practice"
                    title={t("reader.restartTitle")}
                  >
                    <ChevronsLeft className="w-4 h-4 me-1 rtl:rotate-180" />
                    {t("reader.restart")}
                  </Button>
                  <span className="text-xs text-muted-foreground tabular-nums" data-testid="reader-revealed-count">
                    {t("reader.revealed", { count: revealedCount, total: totalAyahs })}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {mistakeAyahs.size > 0 && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200"
                  data-testid="reader-mistake-count"
                  title={t("reader.mistakesTooltip")}
                >
                  {t("reader.mistakes", { count: mistakeAyahs.size })}
                </span>
              )}
              {linkAyahs.size > 0 && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 inline-flex items-center gap-1"
                  data-testid="reader-link-count"
                  title={t("reader.linkTooltip")}
                >
                  <Link2 className="w-3 h-3" />
                  {t("reader.linkIssuesShort", { count: linkAyahs.size })}
                </span>
              )}
              {clearedAyahs.size > 0 && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200"
                  data-testid="reader-cleared-count"
                >
                  {t("reader.cleared", { count: clearedAyahs.size })}
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
              <p className="text-sm font-medium text-foreground">{t("reader.loadErrorTitle")}</p>
              <p className="text-xs mt-1">{t("reader.loadErrorBody")}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => void refetchAyahs()}>
                {t("reader.tryAgain")}
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
                    <>
                      <div className="text-center py-2 border-y border-stone-400/40 dark:border-stone-700/60 bg-[#ead9b5]/60 dark:bg-stone-800/30 rounded">
                        <div className="font-serif text-lg" dir="rtl" lang="ar">
                          {t("reader.surahHeading", { name: SURAHS.find(s => s.number === group.surahNumber)?.arabic ?? group.surahName })}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5" dir="ltr">
                          {t("reader.surahLine", { name: group.surahName, n: group.surahNumber })}
                        </div>
                      </div>
                      {group.surahNumber !== 1 && group.surahNumber !== 9 && (
                        <div
                          className="text-center font-serif py-2"
                          dir="rtl"
                          lang="ar"
                          style={bismillahStyle}
                          data-testid={`reader-bismillah-${group.surahNumber}`}
                        >
                          بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ
                        </div>
                      )}
                    </>
                  )}
                  <p className="font-serif leading-loose text-justify" style={ayahTextStyle}>
                    {group.ayahs.map((a, i) => {
                      const globalIndex = ayahIndexMap.get(a.number) ?? 0;
                      const isVisible = !hideMode || globalIndex < revealedCount;
                      const isLatest = hideMode && globalIndex === revealedCount - 1;
                      const isMistake = mistakeAyahs.has(a.number);
                      const isClear = clearedAyahs.has(a.number);
                      const isLink = linkAyahs.has(a.number);
                      const canLink = a.number > 1; // no "previous ayah" exists for global ayah 1
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
                        /^\ufeff?بِسْمِ\s+[اٱ]للَّهِ\s+[اٱ]لرَّحْمَ?ٰ?نِ\s+[اٱ]لرَّحِيمِ\s*/u,
                        group.isFirstAyah && i === 0 && group.surahNumber !== 1 ? "" : "$&",
                      );

                      const isSelectedShowAll = !hideMode && selectedAyahShowAll === a.number;
                      const showMarkButtons = hideMode || isSelectedShowAll;
                      const handleAyahBodyClick = () => {
                        if (hideMode) return;
                        setSelectedAyahShowAll(prev => (prev === a.number ? null : a.number));
                      };
                      const stopBubble = (e: React.MouseEvent) => e.stopPropagation();

                      return (
                        <span
                          key={a.number}
                          className={[
                            // Mistake colours the text red…
                            isMistake ? "text-rose-600 dark:text-rose-400" : "",
                            // …but the selected/latest highlight is a
                            // background+ring effect, so it must compose
                            // with the red text instead of replacing it.
                            isLatest || isSelectedShowAll
                              ? "bg-amber-200/80 dark:bg-amber-400/30 ring-1 ring-amber-400/70 dark:ring-amber-300/50 rounded px-1 py-0.5"
                              : "",
                          ].filter(Boolean).join(" ")}
                          data-testid={`reader-ayah-${a.number}`}
                          data-selected={isSelectedShowAll ? "true" : undefined}
                          style={isLink ? { textDecoration: "underline wavy", textDecorationColor: "#d97706", textDecorationThickness: "2px" } : undefined}
                        >
                          {showMarkButtons && canLink && (
                            <button
                              type="button"
                              onClick={(e) => { stopBubble(e); handleAyahLink(a.number); }}
                              dir="ltr"
                              className={`inline-flex items-center justify-center mx-1 w-6 h-6 rounded border align-middle font-sans transition-colors ${
                                isLink
                                  ? "bg-amber-500 border-amber-500 text-white"
                                  : "border-amber-300/70 bg-background text-amber-700 hover:bg-amber-100"
                              }`}
                              title={t("reader.linkTitle")}
                              aria-label={t("reader.ariaLinkMistake", { n: a.numberInSurah })}
                              aria-pressed={isLink}
                              data-testid={`reader-ayah-link-${a.number}`}
                            >
                              <Link2 className="w-3 h-3" />
                            </button>
                          )}
                          <span
                            onClick={hideMode ? undefined : handleAyahBodyClick}
                            role={hideMode ? undefined : "button"}
                            tabIndex={hideMode ? undefined : 0}
                            onKeyDown={hideMode ? undefined : (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                handleAyahBodyClick();
                              }
                            }}
                            className={hideMode ? undefined : "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 rounded"}
                            aria-label={hideMode ? undefined : t("reader.ariaSelectAyah", { n: a.numberInSurah })}
                            aria-pressed={hideMode ? undefined : isSelectedShowAll}
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
                          </span>
                          {showMarkButtons && (
                            <span className="inline-flex items-center gap-0.5 mx-1 align-middle" dir="ltr">
                              <button
                                type="button"
                                onClick={(e) => { stopBubble(e); handleAyahMark(a.number, "clear", isLatest); }}
                                className={`w-6 h-6 inline-flex items-center justify-center rounded border text-xs transition-colors ${
                                  isClear
                                    ? "bg-emerald-500 border-emerald-500 text-white"
                                    : "border-border bg-background text-muted-foreground hover:text-emerald-700 hover:border-emerald-300"
                                }`}
                                title={isLatest ? t("reader.clearTitleLatest") : t("reader.clearTitle")}
                                aria-label={t("reader.ariaMarkClear", { n: a.numberInSurah })}
                                aria-pressed={isClear}
                                data-testid={`reader-ayah-clear-${a.number}`}
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { stopBubble(e); handleAyahMark(a.number, "mistake", isLatest); }}
                                className={`w-6 h-6 inline-flex items-center justify-center rounded border text-xs transition-colors ${
                                  isMistake
                                    ? "bg-rose-500 border-rose-500 text-white"
                                    : "border-border bg-background text-muted-foreground hover:text-rose-700 hover:border-rose-300"
                                }`}
                                title={isLatest ? t("reader.mistakeTitleLatest") : t("reader.mistakeTitle")}
                                aria-label={t("reader.ariaMarkMistake", { n: a.numberInSurah })}
                                aria-pressed={isMistake}
                                data-testid={`reader-ayah-mistake-${a.number}`}
                              >
                                <X className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { stopBubble(e); setLocation(`/ayahs/${a.number}`); }}
                                className="w-6 h-6 inline-flex items-center justify-center rounded border text-xs transition-colors border-border bg-background text-muted-foreground hover:text-primary hover:border-primary/50"
                                title={t("reader.openAyahDetail")}
                                aria-label={t("reader.ariaOpenAyahDetail", { n: a.numberInSurah })}
                                data-testid={`reader-ayah-detail-${a.number}`}
                              >
                                <ArrowUpRight className="w-3 h-3" />
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
                <p className="text-center text-sm text-muted-foreground" dir="ltr">{t("reader.noAyahs")}</p>
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
                    <Eye className="w-4 h-4 me-2" />
                    {t("reader.showNextAyah")}
                    <span className="ms-2 text-xs font-normal opacity-80">{t("reader.showNextProgress", { n: revealedCount + 1, total: totalAyahs })}</span>
                  </Button>
                </div>
              )}
              {hideMode && revealedCount >= totalAyahs && totalAyahs > 0 && (
                <div className="pt-4 text-center text-sm text-muted-foreground" data-testid="reader-all-revealed">
                  {t("reader.allRevealed")}
                  {mistakeAyahs.size > 0 ? t("reader.allRevealedWith", { count: mistakeAyahs.size }) : t("reader.allRevealedEnd")}
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
              <ChevronLeft className="w-4 h-4 me-1" />
              {t("reader.next")}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(pageNumber - 1)}
              disabled={pageNumber <= 1}
              data-testid="btn-prev-page"
            >
              {t("reader.previous")}
              <ChevronRight className="w-4 h-4 ms-1" />
            </Button>
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="text-sm font-medium">{t("reader.markRecitedTitle")}</div>
              {lastRecitedLabel && (
                <div className="text-xs text-muted-foreground" data-testid="reader-last-recited">
                  {t("common.lastRecited")}: {lastRecitedLabel}
                </div>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {QUALITIES.map(({ value }) => {
                const isActive = currentQuality === value;
                const style = qualityStyle[value];
                const label = t(`quality.${value}`);
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
                    aria-label={t("reader.ariaMarkPage", { n: pageNumber, label })}
                    aria-pressed={isActive}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {currentPage && !currentPage.inScope && currentQuality === null && (
              <p className="text-[11px] text-muted-foreground mt-2">{t("reader.notInScopeNote")}</p>
            )}
          </div>

          <div className="border-t pt-3 flex justify-center">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleMarkTelawa}
              disabled={recordTelawaRead.isPending}
              data-testid="reader-mark-telawa"
              title={t("reader.markTelawaTitle")}
              className="px-4 text-xs"
            >
              <Repeat className="w-3.5 h-3.5 me-1" />
              {t("reader.markTelawa")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
