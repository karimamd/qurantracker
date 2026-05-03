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
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  useGetSettings,
  useListActivePageMistakes,
  useAddActivePageMistake,
  useRemoveActivePageMistake,
  getListActivePageMistakesQueryKey,
  getGetMistakesQueryKey,
} from "@workspace/api-client-react";
import type { ActiveAyahMistake } from "@workspace/api-client-react";
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

  const [fontSize, setFontSize] = useState<number>(FONT_DEFAULT_FALLBACK);
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

  const adjustFontSize = (delta: number) =>
    setFontSize((prev) => Math.min(FONT_MAX, Math.max(FONT_MIN, prev + delta)));

  const pageNumber = ayah?.pageNumber ?? 0;
  const pageMistakesQuery = useListActivePageMistakes(pageNumber, {
    query: {
      enabled: pageNumber > 0,
      queryKey: getListActivePageMistakesQueryKey(pageNumber),
    },
  });
  const addMistake = useAddActivePageMistake();
  const removeMistake = useRemoveActivePageMistake();

  const currentMark = useMemo<Mark | null>(() => {
    if (!ayah || !pageMistakesQuery.data) return null;
    const m = (pageMistakesQuery.data as ActiveAyahMistake[]).find(
      (am) => am.globalAyahNumber === ayah.globalAyahNumber,
    );
    return (m?.mistakeType as Mark | undefined) ?? null;
  }, [ayah, pageMistakesQuery.data]);

  const invalidateMistakes = () => {
    queryClient.invalidateQueries({ queryKey: getGetMistakesQueryKey() });
  };

  const setMark = (mark: Mark) => {
    if (!ayah) return;
    const targetPage = ayah.pageNumber;
    queryClient.cancelQueries({ queryKey: getListActivePageMistakesQueryKey(targetPage) });

    // Toggle: tapping the active mark clears it (resolves the active row
    // server-side); tapping a different mark switches to it.
    if (currentMark === mark) {
      removeMistake.mutate(
        { pageNumber: targetPage, data: { globalAyahNumber: ayah.globalAyahNumber, mistakeType: mark } },
        {
          onSuccess: (data) => {
            queryClient.setQueryData(getListActivePageMistakesQueryKey(targetPage), data);
            invalidateMistakes();
          },
          onError: () => toast({ title: t("reader.markFailed"), variant: "destructive" }),
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
          queryClient.setQueryData(getListActivePageMistakesQueryKey(targetPage), data);
          invalidateMistakes();
        },
        onError: () => toast({ title: t("reader.markFailed"), variant: "destructive" }),
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

  const goPrev = () => {
    if (target == null || target <= 1) return;
    setLocation(`/ayahs/${target - 1}`);
  };
  const goNext = () => {
    if (target == null || target >= TOTAL_AYAHS) return;
    setLocation(`/ayahs/${target + 1}`);
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

            <div
              className="rounded-xl bg-card border px-6 py-10 text-right"
              dir="rtl"
              data-testid="ayah-detail-text"
            >
              <p style={ayahTextStyle} className="text-foreground">
                {ayah.text}
              </p>
            </div>

            {/* Tafsir Muyassar — collapsed by default. */}
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

            {/* Word-by-word — collapsed by default. */}
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

            <div className="flex items-center justify-center gap-2 flex-wrap" data-testid="ayah-detail-actions">
              <Button
                size="lg"
                variant={currentMark === "cleared" ? "default" : "outline"}
                onClick={() => setMark("cleared")}
                className={currentMark === "cleared" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}
                data-testid="ayah-detail-mark-clear"
              >
                <Check className="w-4 h-4 me-1.5" />
                {t("ayahDetail.markClear")}
              </Button>
              <Button
                size="lg"
                variant={currentMark === "memorization" ? "default" : "outline"}
                onClick={() => setMark("memorization")}
                className={currentMark === "memorization" ? "bg-rose-600 hover:bg-rose-700 text-white" : ""}
                data-testid="ayah-detail-mark-mistake"
              >
                <X className="w-4 h-4 me-1.5" />
                {t("ayahDetail.markMistake")}
              </Button>
              <Button
                size="lg"
                variant={currentMark === "link" ? "default" : "outline"}
                onClick={() => setMark("link")}
                className={currentMark === "link" ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}
                data-testid="ayah-detail-mark-link"
              >
                <Link2 className="w-4 h-4 me-1.5" />
                {t("ayahDetail.markLink")}
              </Button>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t">
              <Button
                variant="ghost"
                onClick={goPrev}
                disabled={target <= 1}
                data-testid="ayah-detail-prev"
              >
                <ChevronLeft className="w-4 h-4 me-1 rtl:rotate-180" />
                {t("ayahDetail.previous")}
              </Button>
              <Link
                href={`/reader/${ayah.pageNumber}?practice=${ayah.globalAyahNumber}`}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border bg-background text-sm font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
                data-testid="ayah-detail-open-reader"
              >
                <BookMarked className="w-4 h-4" />
                {t("ayahDetail.openInReader", { page: ayah.pageNumber })}
              </Link>
              <Button
                variant="ghost"
                onClick={goNext}
                disabled={target >= TOTAL_AYAHS}
                data-testid="ayah-detail-next"
              >
                {t("ayahDetail.next")}
                <ChevronRight className="w-4 h-4 ms-1 rtl:rotate-180" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

