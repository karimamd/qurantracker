/**
 * Ayah detail (/ayahs/:globalAyahNumber) — single-ayah focus screen.
 *
 * Behaviour:
 *   - Renders ONLY this ayah, large, centred, with a configurable font
 *     size. The default is loaded from settings.ayahViewFontSize so the
 *     user's preferred study size is restored across visits; the +/-
 *     buttons here are session-local and do NOT mutate the saved
 *     default (that lives in Settings).
 *   - Tick / X / Link buttons drive the same per-page active-mistake
 *     endpoints used by the Reader, so a mark made here shows up
 *     instantly in the Reader and on /mistakes (and vice-versa).
 *   - Prev / Next buttons walk the global 1..6236 sequence.
 *   - "Open in Reader" jumps to the Reader at this ayah's full Mushaf
 *     page with the ?practice=<global> deep-link, exactly like the
 *     /mistakes feed entries.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  useGetSettings,
  useUpdateSettings,
  getGetSettingsQueryKey,
  useListActivePageMistakes,
  useAddActivePageMistake,
  useRemoveActivePageMistake,
  useClearAllActivePageMistakes,
  getListActivePageMistakesQueryKey,
  getGetMistakesQueryKey,
  useGetTelawaToday,
  useListHomework,
  useGetHomework,
  getGetHomeworkQueryKey,
  getListPageProgressQueryKey,
  getGetProgressOverviewQueryKey,
  getListJuzProgressQueryKey,
  getListSurahProgressQueryKey,
  getListRob3ProgressQueryKey,
  getGetRecentActivityQueryKey,
  getGetJuzDetailQueryKey,
  getGetSurahDetailQueryKey,
  getListHomeworkQueryKey,
  getGetRewardsSummaryQueryKey,
} from "@workspace/api-client-react";
import type { ActiveAyahMistake } from "@workspace/api-client-react";
import { isOfflineQueued } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eraser,
  Languages,
  Link2,
  Minus,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { getAyahIndex, type AyahIndexEntry } from "@/lib/ayah-index";
import { getAyahTafsir } from "@/lib/tafsir";
import { getAyahWbw, type WbwWord } from "@/lib/wbw";
import { useAuth } from "@clerk/react";
import { readCachedUiSettings, clampFontSize, resolveIdentity } from "@/lib/ui-settings-cache";

// Bounds mirror the OpenAPI schema for settings.ayahViewFontSize so a
// user's saved default is always honoured (e.g. 14 stays 14, never falls
// back to FONT_DEFAULT_FALLBACK).
const FONT_MIN = 14;
const FONT_MAX = 96;
const FONT_DEFAULT_FALLBACK = 40;
const TOTAL_AYAHS = 6236;

type Mark = "memorization" | "link" | "cleared";

export default function AyahDetail() {
  const { t, i18n } = useTranslation();
  const params = useParams<{ globalAyahNumber?: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const isRtl = i18n.dir() === "rtl";

  const target = useMemo(() => {
    const n = parseInt(params.globalAyahNumber ?? "", 10);
    if (!Number.isFinite(n) || n < 1 || n > TOTAL_AYAHS) return null;
    return n;
  }, [params.globalAyahNumber]);

  const [index, setIndex] = useState<AyahIndexEntry[] | null>(null);
  const [indexError, setIndexError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setIndexError(false);
    getAyahIndex()
      .then((entries) => {
        if (!cancelled) setIndex(entries);
      })
      .catch(() => {
        if (!cancelled) setIndexError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // `null` = still loading; `undefined` = loaded-but-not-found (so we
  // can show "invalid ayah" instead of an infinite skeleton).
  const ayah = useMemo<AyahIndexEntry | null | undefined>(() => {
    if (target == null) return undefined;
    if (!index) return null;
    return index.find((a) => a.globalAyahNumber === target);
  }, [index, target]);

  const { data: settings } = useGetSettings();

  // Seeded from the synchronous, identity-scoped settings mirror (see
  // reader.tsx) so a reloaded tab shows the saved ayah font size on first
  // paint without risking another account's value.
  const { userId: clerkUserId } = useAuth();
  const [fontSize, setFontSize] = useState<number>(
    () =>
      clampFontSize(
        readCachedUiSettings(resolveIdentity(clerkUserId)).ayahViewFontSize,
        FONT_MIN,
        FONT_MAX,
      ) ?? FONT_DEFAULT_FALLBACK,
  );
  // Reseed the font size from settings whenever they finish loading or the
  // user navigates to a different ayah. We re-apply on every target change
  // so backing out to the list and opening another card always shows the
  // user's saved default rather than the previous session's tweaked size.
  // Importantly, we DO NOT clobber the size while settings are still
  // loading (data === undefined) — otherwise the brief gap between an
  // invalidate-and-refetch on /settings and the next /ayahs navigation
  // would flash the fallback before the saved value lands.
  useEffect(() => {
    const saved = settings?.ayahViewFontSize;
    if (saved && saved >= FONT_MIN && saved <= FONT_MAX) {
      setFontSize(saved);
    } else if (settings) {
      // Settings loaded but the field is missing/out-of-range — fall back.
      setFontSize(FONT_DEFAULT_FALLBACK);
    }
  }, [settings, target]);

  // Persist in-page +/- tweaks back to settings.ayahViewFontSize so they
  // become the new default the next time any ayah is opened — same
  // pattern as the Reader's readerFontSize. Debounced so a burst of
  // clicks coalesces into a single PATCH; flushed on unmount so a user
  // who clicks "+" then navigates away within the debounce window
  // doesn't silently lose that final write.
  const updateSettings = useUpdateSettings();
  const fontSizePersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      { data: { ayahViewFontSize: size } },
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
  useEffect(() => {
    return () => {
      // Unmount = navigation away or page close. Flush any pending
      // tweak synchronously so it isn't lost.
      flushFontSize();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const adjustFontSize = (delta: number) =>
    setFontSize((prev) => {
      const next = Math.min(FONT_MAX, Math.max(FONT_MIN, prev + delta));
      if (next !== prev) persistFontSize(next);
      return next;
    });

  const pageNumber = ayah?.pageNumber ?? 0;

  // Context badges — is this ayah's page in today's Telawa batch or an active homework?
  const { data: telawaToday } = useGetTelawaToday();
  const { data: homeworkSessions } = useListHomework();
  const activeHomeworkId = homeworkSessions?.find(s => s.status === "active")?.id ?? null;
  const { data: activeHomeworkDetail } = useGetHomework(activeHomeworkId ?? 0, {
    query: { enabled: activeHomeworkId !== null, queryKey: getGetHomeworkQueryKey(activeHomeworkId ?? 0) },
  });
  const isTelawaPage = pageNumber > 0 && (telawaToday?.upcomingPages.includes(pageNumber) ?? false);
  const homeworkItem = pageNumber > 0
    ? (activeHomeworkDetail?.items.find(item => item.pageNumber === pageNumber) ?? null)
    : null;

  const pageMistakesQuery = useListActivePageMistakes(pageNumber, {
    query: {
      enabled: pageNumber > 0,
      queryKey: getListActivePageMistakesQueryKey(pageNumber),
    },
  });
  const addMistake = useAddActivePageMistake();
  const removeMistake = useRemoveActivePageMistake();
  const clearAllMistakes = useClearAllActivePageMistakes();

  // An ayah can now have up to two active marks simultaneously: one of
  // {cleared, memorization} (mutually exclusive) plus an independent "link"
  // mark. Track each mark type separately instead of collapsing into one.
  const activeMarkSet = useMemo<Set<Mark>>(() => {
    if (!ayah || !pageMistakesQuery.data) return new Set();
    const marks = (pageMistakesQuery.data as ActiveAyahMistake[])
      .filter((am) => am.globalAyahNumber === ayah.globalAyahNumber)
      .map((am) => am.mistakeType as Mark);
    return new Set(marks);
  }, [ayah, pageMistakesQuery.data]);

  // Optimistic local overlay of the marks. Button colors read from THIS set
  // so a tap responds instantly instead of waiting for the server round-trip.
  // Re-seeded from the server's authoritative list whenever it changes —
  // but never while a mark mutation is still in-flight (pendingMarkCount
  // guard, same pattern as the Reader) or a slow response would wipe a
  // newer optimistic state and make the button appear to "not respond".
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [localMarks, setLocalMarks] = useState<Set<Mark>>(new Set());
  const pendingMarkCount = useRef(0);
  // Ref mirror of localMarks so rapid taps read the CURRENT state instead of
  // a stale render closure, and rollbacks can be applied against the latest.
  const localMarksRef = useRef<Set<Mark>>(new Set());
  const applyLocalMarks = (next: Set<Mark>) => {
    localMarksRef.current = next;
    setLocalMarks(next);
  };
  // Track which ayah the local state belongs to: navigating to another ayah
  // must always re-seed (and drop the pending guard) so marks from the
  // previous ayah never bleed onto the new one while a mutation is in-flight.
  const seededAyahRef = useRef<number | null>(null);
  const ayahNumber = ayah?.globalAyahNumber ?? null;
  useEffect(() => {
    const ayahChanged = ayahNumber !== seededAyahRef.current;
    if (ayahChanged) {
      seededAyahRef.current = ayahNumber;
      pendingMarkCount.current = 0;
      setLastSaved(null);
    } else if (pendingMarkCount.current > 0) {
      return;
    }
    applyLocalMarks(activeMarkSet);
  }, [activeMarkSet, ayahNumber]);

  const isClear = localMarks.has("cleared");
  const isMemo = localMarks.has("memorization");
  const isLink = localMarks.has("link");

  // A per-ayah mark hits the same /active-mistakes endpoints the Reader
  // uses, and the server can auto-assign a page recitation as a side effect
  // (settings.autoAssignPageFromAyahs) when a mark completes the page. So we
  // must invalidate the SAME broad set the Reader does — not just the global
  // mistakes feed — or the page status, progress views, and the homework
  // "ayah by ayah" list stay stale after marking from this screen.
  const invalidateMistakes = () => {
    queryClient.invalidateQueries({ queryKey: getGetMistakesQueryKey() });
    if (!ayah) return;
    queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListJuzProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListSurahProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListRob3ProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetRewardsSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetJuzDetailQueryKey(ayah.juzNumber) });
    queryClient.invalidateQueries({ queryKey: getGetSurahDetailQueryKey(ayah.surahNumber) });
    queryClient.invalidateQueries({ queryKey: getListHomeworkQueryKey() });
    // Covers every open homework detail AND its "ayah by ayah" list
    // (getGetHomework / getGetHomeworkAyahs both key off "/api/homework/…").
    queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/homework/") });
    // Force a definitive refetch so an auto-assigned recitation surfaces
    // immediately rather than on the next focus/refetch.
    queryClient.refetchQueries({ queryKey: getListPageProgressQueryKey() });
  };

  const handleClearAll = () => {
    if (!ayah) return;
    const targetPage = ayah.pageNumber;
    // Snapshot current local state for rollback on error.
    const prevMarks = localMarksRef.current;
    // Optimistically clear marks for this ayah immediately.
    applyLocalMarks(new Set());
    queryClient.cancelQueries({ queryKey: getListActivePageMistakesQueryKey(targetPage) });
    clearAllMistakes.mutate(
      { pageNumber: targetPage },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getListActivePageMistakesQueryKey(targetPage), data);
          invalidateMistakes();
          toast({ title: t("reader.clearAllMarksDone", { page: targetPage }) });
        },
        onError: (err) => {
          applyLocalMarks(prevMarks);
          if (isOfflineQueued(err)) { toast({ title: t("offline.savedLocally") }); return; }
          toast({ title: t("reader.clearAllMarksFailed"), variant: "destructive" });
        },
      },
    );
  };

  const setMark = (mark: Mark) => {
    if (!ayah) return;
    const targetPage = ayah.pageNumber;
    // Cancel any in-flight GET for this page's active-mistakes list so a
    // slow stale response can't overwrite the optimistic state below.
    queryClient.cancelQueries({ queryKey: getListActivePageMistakesQueryKey(targetPage) });

    // Read the latest state from the ref (not the render closure) so very
    // fast repeated taps each make the correct toggle decision.
    const current = localMarksRef.current;
    const isActive = current.has(mark);

    // Toggle: tapping an active mark removes it; tapping an inactive mark adds it.
    // "cleared" and "memorization" are mutually exclusive (the server resolves
    // whichever one is opposite). "link" is fully independent of both.
    // Apply the same rules optimistically so the button responds instantly.
    const counterpart: Mark | null =
      mark === "cleared" ? "memorization" : mark === "memorization" ? "cleared" : null;
    const removedCounterpart = !isActive && counterpart !== null && current.has(counterpart);

    const next = new Set(current);
    if (isActive) {
      next.delete(mark);
    } else {
      next.add(mark);
      if (counterpart) next.delete(counterpart);
    }
    applyLocalMarks(next);

    // Operation-scoped rollback: undo ONLY this tap's delta against the
    // latest state, so a failing older request never reverts newer taps.
    const rollback = () => {
      const cur = new Set(localMarksRef.current);
      if (isActive) {
        cur.add(mark);
      } else {
        cur.delete(mark);
        if (removedCounterpart && counterpart) cur.add(counterpart);
      }
      applyLocalMarks(cur);
    };

    pendingMarkCount.current++;
    if (isActive) {
      removeMistake.mutate(
        { pageNumber: targetPage, data: { globalAyahNumber: ayah.globalAyahNumber, mistakeType: mark } },
        {
          onSuccess: (data) => {
            pendingMarkCount.current = Math.max(0, pendingMarkCount.current - 1);
            queryClient.setQueryData(getListActivePageMistakesQueryKey(targetPage), data);
            setLastSaved(new Date());
            invalidateMistakes();
          },
          onError: (err) => {
            pendingMarkCount.current = Math.max(0, pendingMarkCount.current - 1);
            if (isOfflineQueued(err)) { toast({ title: t("offline.savedLocally") }); return; }
            rollback();
            toast({ title: t("reader.markFailed"), variant: "destructive" });
          },
        },
      );
      return;
    }

    addMistake.mutate(
      {
        pageNumber: targetPage,
        data: {
          surahNumber: ayah.surahNumber,
          ayahNumberInSurah: ayah.numberInSurah,
          globalAyahNumber: ayah.globalAyahNumber,
          mistakeType: mark,
        },
      },
      {
        onSuccess: (data) => {
          pendingMarkCount.current = Math.max(0, pendingMarkCount.current - 1);
          queryClient.setQueryData(getListActivePageMistakesQueryKey(targetPage), data);
          setLastSaved(new Date());
          invalidateMistakes();
        },
        onError: (err) => {
          pendingMarkCount.current = Math.max(0, pendingMarkCount.current - 1);
          if (isOfflineQueued(err)) { toast({ title: t("offline.savedLocally") }); return; }
          rollback();
          toast({ title: t("reader.markFailed"), variant: "destructive" });
        },
      },
    );
  };

  // ── Tafsir Muyassar (collapsed by default) ────────────────────────
  // Lazy-loaded via the offline-first chain in lib/tafsir.ts: per-ayah
  // IDB cache → bundled local dump → alquran.cloud per-ayah fallback.
  // We start the fetch as soon as the target ayah is known (not gated
  // on the user expanding the section) so opening the section is
  // instant on warm IDB and only ever waits for the network on a cold
  // first-ever load with no bundle.
  const [tafsir, setTafsir] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (target == null) return;
    let cancelled = false;
    setTafsir(undefined);
    getAyahTafsir(target)
      .then((t) => {
        if (!cancelled) setTafsir(t);
      })
      .catch(() => {
        if (!cancelled) setTafsir(null);
      });
    return () => {
      cancelled = true;
    };
  }, [target]);

  // ── Word-by-word (collapsed by default) ───────────────────────────
  // Same offline-first chain in lib/wbw.ts. Needs surah + ayah-in-surah
  // for the quran.com fallback verse_key, so we wait for `ayah` (the
  // index entry) instead of just `target`.
  const [wbw, setWbw] = useState<WbwWord[] | null | undefined>(undefined);
  useEffect(() => {
    if (!ayah) return;
    let cancelled = false;
    setWbw(undefined);
    getAyahWbw({
      globalAyahNumber: ayah.globalAyahNumber,
      surahNumber: ayah.surahNumber,
      ayahNumberInSurah: ayah.numberInSurah,
    })
      .then((w) => {
        if (!cancelled) setWbw(w);
      })
      .catch(() => {
        if (!cancelled) setWbw(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ayah]);

  // Anchor we scroll to whenever the user advances/retreats by an ayah,
  // whether via the top nav, the bottom nav, or keyboard arrows. We
  // pin it to the top nav row (just above the ayah text) so both the
  // controls and the new ayah are visible after the scroll. The
  // surrounding Card stays mounted across navigations, so scrolling
  // the same element on every nav is reliable.
  const ayahScrollRef = useRef<HTMLDivElement>(null);
  const scrollToAyahTop = () => {
    // rAF gives the SPA router one frame to commit the new URL/state
    // before we measure-and-scroll, so the new ayah is the one in
    // view rather than the previous one's position.
    requestAnimationFrame(() => {
      ayahScrollRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };
  const goPrev = () => {
    if (target == null || target <= 1) return;
    setLocation(`/ayahs/${target - 1}`);
    scrollToAyahTop();
  };
  const goNext = () => {
    if (target == null || target >= TOTAL_AYAHS) return;
    setLocation(`/ayahs/${target + 1}`);
    scrollToAyahTop();
  };

  // Keyboard arrows for prev/next nav (skip when typing in inputs).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      // Mirror the Reader: ArrowRight is "next" in LTR but "previous" in
      // an RTL UI. The actual ayah sequence is monotonic on
      // globalAyahNumber so we just flip which key advances it.
      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (isRtl) goPrev();
        else goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (isRtl) goNext();
        else goPrev();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, isRtl]);

  const ayahTextStyle: CSSProperties = {
    fontSize: `${fontSize}px`,
    lineHeight: 1.9,
    wordSpacing: "0.1em",
    fontFamily: "'Noto Naskh Arabic', 'Amiri', serif",
  };

  if (target == null || ayah === undefined || indexError) {
    return (
      <Card className="border shadow-sm">
        <CardContent className="py-12 text-center text-sm text-muted-foreground" data-testid="ayah-detail-invalid">
          {indexError ? t("ayahsList.loadError") : t("ayahDetail.invalid")}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl mx-auto" data-testid="ayah-detail-page">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link
          href="/ayahs"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          data-testid="ayah-detail-back"
        >
          <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
          {t("ayahDetail.backToList")}
        </Link>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          {t("ayahDetail.title", { n: target })}
        </h2>
      </div>

      {!ayah ? (
        <Card className="border shadow-sm">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-8 w-1/2" />
          </CardContent>
        </Card>
      ) : (
        <Card className="border shadow-sm">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20" data-testid="ayah-detail-surah">
                  {ayah.surahNumber}. {ayah.surahName} · {ayah.numberInSurah}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground border" data-testid="ayah-detail-juz">
                  {t("common.juz")} {ayah.juzNumber}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground border" data-testid="ayah-detail-page">
                  {t("common.page")} {ayah.pageNumber}
                </span>
                {isTelawaPage && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-700 border border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800" data-testid="ayah-detail-badge-telawa">
                    <BookOpen className="w-3 h-3" />
                    {t("reader.badgeTelawa")}
                  </span>
                )}
                {homeworkItem && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800" data-testid="ayah-detail-badge-homework">
                    <ClipboardList className="w-3 h-3" />
                    {t(`reader.badgeHomework${homeworkItem.type === "memorize" ? "Memorize" : "Revise"}`)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => adjustFontSize(-2)}
                  disabled={fontSize <= FONT_MIN}
                  aria-label={t("ayahDetail.decreaseFont")}
                  data-testid="ayah-detail-font-minus"
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="text-xs tabular-nums w-9 text-center text-muted-foreground" data-testid="ayah-detail-font-size">
                  {fontSize}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => adjustFontSize(2)}
                  disabled={fontSize >= FONT_MAX}
                  aria-label={t("ayahDetail.increaseFont")}
                  data-testid="ayah-detail-font-plus"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Scroll anchor — keeps the ayah's top edge in view after
                prev/next navigation. The top counter row also acts as a
                quick-nav duplicate so the user doesn't have to scroll
                to the bottom after expanding Tafsir / WBW. */}
            <div
              ref={ayahScrollRef}
              className="flex items-center justify-between gap-2 scroll-mt-4"
              data-testid="ayah-detail-nav-top"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={goPrev}
                disabled={target <= 1}
                data-testid="ayah-detail-prev-top"
              >
                <ChevronLeft className="w-4 h-4 me-1 rtl:rotate-180" />
                {t("ayahDetail.previous")}
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums" aria-hidden>
                {target} / {TOTAL_AYAHS}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={goNext}
                disabled={target >= TOTAL_AYAHS}
                data-testid="ayah-detail-next-top"
              >
                {t("ayahDetail.next")}
                <ChevronRight className="w-4 h-4 ms-1 rtl:rotate-180" />
              </Button>
            </div>

            {/* 1. Link button — above the Ayah text */}
            <div className="flex justify-center">
              <Button
                size="lg"
                variant={isLink ? "default" : "outline"}
                onClick={() => setMark("link")}
                className={isLink ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}
                data-testid="ayah-detail-mark-link"
              >
                <Link2 className="w-4 h-4 me-1.5" />
                {t("ayahDetail.markLink")}
              </Button>
            </div>

            {/* 2. Ayah text */}
            <div
              className="rounded-xl bg-card border px-6 py-10 text-right"
              dir="rtl"
              data-testid="ayah-detail-text"
            >
              <p style={ayahTextStyle} className="text-foreground">
                {ayah.text}
              </p>
            </div>

            {/* 3. Mark buttons — tick and mistake only */}
            <div className="flex items-center justify-center gap-2 flex-wrap" data-testid="ayah-detail-actions">
              <Button
                size="lg"
                variant={isClear ? "default" : "outline"}
                onClick={() => setMark("cleared")}
                className={isClear ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                data-testid="ayah-detail-mark-clear"
              >
                <Check className="w-4 h-4 me-1.5" />
                {t("ayahDetail.markClear")}
              </Button>
              <Button
                size="lg"
                variant={isMemo ? "default" : "outline"}
                onClick={() => setMark("memorization")}
                className={isMemo ? "bg-rose-600 hover:bg-rose-700 text-white" : ""}
                data-testid="ayah-detail-mark-mistake"
              >
                <X className="w-4 h-4 me-1.5" />
                {t("ayahDetail.markMistake")}
              </Button>
            </div>

            {/* 3. Navigation — prev, next, open in reader */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={goPrev}
                disabled={target <= 1}
                data-testid="ayah-detail-prev"
                className="shrink-0"
              >
                <ChevronLeft className="w-4 h-4 me-1 rtl:rotate-180" />
                {t("ayahDetail.previous")}
              </Button>
              <Link
                href={`/reader/${ayah.pageNumber}?practice=${ayah.globalAyahNumber}`}
                className="min-w-0 inline-flex items-center gap-1.5 px-2 py-1.5 rounded-md border bg-background text-xs font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors truncate"
                data-testid="ayah-detail-open-reader"
              >
                <BookMarked className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{t("ayahDetail.openInReader", { page: ayah.pageNumber })}</span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                onClick={goNext}
                disabled={target >= TOTAL_AYAHS}
                data-testid="ayah-detail-next"
                className="shrink-0"
              >
                {t("ayahDetail.next")}
                <ChevronRight className="w-4 h-4 ms-1 rtl:rotate-180" />
              </Button>
            </div>

            {/* 4. Tafsir Muyassar — collapsed by default. */}
            <Collapsible data-testid="ayah-detail-tafsir">
              <CollapsibleTrigger
                className="flex w-full items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium hover:bg-muted/70 transition-colors group"
                data-testid="ayah-detail-tafsir-trigger"
              >
                <span className="flex items-center gap-2 text-start">
                  <BookOpen className="w-4 h-4 text-primary shrink-0" />
                  <span className="flex flex-col">
                    <span>{t("ayahDetail.tafsirTitle")}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {t("ayahDetail.tafsirSubtitle")}
                    </span>
                  </span>
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 shrink-0" />
              </CollapsibleTrigger>
              <CollapsibleContent
                className="rounded-md border border-t-0 px-4 py-3 -mt-px bg-background"
                data-testid="ayah-detail-tafsir-content"
              >
                {tafsir === undefined ? (
                  <Skeleton className="h-16 w-full" />
                ) : tafsir === null || tafsir.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("ayahDetail.tafsirUnavailable")}
                  </p>
                ) : (
                  <p
                    dir="rtl"
                    className="text-base leading-loose text-right text-foreground"
                    style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif" }}
                    data-testid="ayah-detail-tafsir-text"
                  >
                    {tafsir}
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* 4. Word-by-word — collapsed by default. */}
            <Collapsible data-testid="ayah-detail-wbw">
              <CollapsibleTrigger
                className="flex w-full items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium hover:bg-muted/70 transition-colors group"
                data-testid="ayah-detail-wbw-trigger"
              >
                <span className="flex items-center gap-2 text-start">
                  <Languages className="w-4 h-4 text-primary shrink-0" />
                  <span className="flex flex-col">
                    <span>{t("ayahDetail.wbwTitle")}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {t("ayahDetail.wbwSubtitle")}
                    </span>
                  </span>
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180 shrink-0" />
              </CollapsibleTrigger>
              <CollapsibleContent
                className="rounded-md border border-t-0 px-3 py-3 -mt-px bg-background"
                data-testid="ayah-detail-wbw-content"
              >
                {wbw === undefined ? (
                  <Skeleton className="h-20 w-full" />
                ) : wbw === null || wbw.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("ayahDetail.wbwUnavailable")}
                  </p>
                ) : (
                  // Mushaf reading order is right-to-left, so we render
                  // the cards in RTL flow and let flex-wrap stack rows
                  // top-to-bottom. Each card stacks: Arabic word →
                  // transliteration → English gloss.
                  <div
                    dir="rtl"
                    className="flex flex-wrap gap-2"
                    data-testid="ayah-detail-wbw-list"
                  >
                    {wbw.map((w, i) => (
                      <div
                        key={i}
                        className="flex flex-col items-center gap-0.5 px-2.5 py-2 rounded-md border bg-muted/30 min-w-[80px]"
                        data-testid={`ayah-detail-wbw-word-${i}`}
                      >
                        <span
                          className="text-xl leading-tight"
                          style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif" }}
                        >
                          {w.ar}
                        </span>
                        {w.tr && (
                          <span dir="ltr" className="text-[10px] italic text-muted-foreground leading-tight">
                            {w.tr}
                          </span>
                        )}
                        {w.en && (
                          // No complete public Arabic-to-Arabic per-word gloss
                          // dataset exists (quran.com's wbw catalog covers
                          // en/ur/id/bn/tr/fa/hi/ta but not Arabic; QUL/Tarteel's
                          // word-by-word sets are the same non-Arabic languages;
                          // alquran.cloud "ar" editions are actually English; and
                          // Arabic word-level resources like غريب القرآن only cover
                          // rare words, not every word). So we fall back to the
                          // English gloss even in Arabic UI mode — better to have an
                          // explanation for every word than none. The Arabic word +
                          // transliteration always render above it.
                          <span dir="ltr" className="text-xs text-foreground/80 text-center leading-tight">
                            {w.en}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* 5. Clear all marks for this page */}
            <div className="flex justify-center pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                disabled={clearAllMistakes.isPending}
                title={t("reader.clearAllMarksTitle")}
                data-testid="ayah-detail-clear-all"
                className="text-muted-foreground hover:text-destructive hover:border-destructive/40"
              >
                <Eraser className="w-3.5 h-3.5 me-1.5" />
                {t("reader.clearAllMarks")}
              </Button>
            </div>

            {/* 6. Save timestamp */}
            {lastSaved && (
              <p
                className="text-center text-[11px] text-muted-foreground"
                data-testid="ayah-detail-saved-at"
              >
                {t("ayahDetail.savedAt", {
                  time: lastSaved.toLocaleTimeString(i18n.language, { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
                })}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

