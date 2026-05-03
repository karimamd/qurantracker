/**
 * Ayahs list (/ayahs) — finest-grain browser of the 6,236 ayahs as a card
 * grid. Built entirely client-side from the bundled `quran-dump.json`
 * (lib/ayah-index.ts) so there are no new server endpoints.
 *
 * Filters:
 *   - Diacritic-insensitive Arabic text search (via stripTashkeel).
 *   - Surah, Juz, page-range narrowing.
 *
 * Each card shows Surah · Juz · Page metadata and routes to the detail
 * page on click.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useGetMistakes } from "@workspace/api-client-react";
import type { Mistake } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Search, X, Link2 } from "lucide-react";
import { getAyahIndex, type AyahIndexEntry } from "@/lib/ayah-index";
import { normaliseSearchQuery } from "@/lib/arabic-text";
import { SURAHS, TOTAL_PAGES } from "@/lib/quran-ref";

const PAGE_SIZE = 60;

// "marked" = either kind of active mistake; "memorization"/"link" narrow it
// further. The list pulls the same active-mistake feed used by /mistakes so
// any mark made in the Reader, the per-page Active list, or the single-ayah
// detail view shows up here without an extra round-trip.
type MarkFilter = "all" | "marked" | "memorization" | "link";

export default function AyahsList() {
  const { t } = useTranslation();
  const [index, setIndex] = useState<AyahIndexEntry[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [surahFilter, setSurahFilter] = useState<string>("all");
  const [juzFilter, setJuzFilter] = useState<string>("all");
  const [pageFromStr, setPageFromStr] = useState<string>("");
  const [pageToStr, setPageToStr] = useState<string>("");
  const [markFilter, setMarkFilter] = useState<MarkFilter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Pull every active mistake (server returns one row per type, so the
  // true ceiling is 2 × 6236 = 12472 — one memorization + one link per
  // ayah). This lets each card render its current mark badges — and
  // powers the "marked only" filter — without a per-page fetch as the
  // user scrolls.
  const { data: mistakesData } = useGetMistakes({ limit: 12472 });
  // Track presence of each mark type independently so an ayah with BOTH
  // a memorization and a link mark is correctly included by either
  // narrow filter; the badge UI still picks one colour for display.
  type MarkPresence = { hasMem: boolean; hasLink: boolean };
  const markByGlobal = useMemo<Map<number, MarkPresence>>(() => {
    const map = new Map<number, MarkPresence>();
    for (const m of (mistakesData?.mistakes ?? []) as Mistake[]) {
      const cur = map.get(m.globalAyahNumber) ?? { hasMem: false, hasLink: false };
      if (m.mistakeType === "memorization") cur.hasMem = true;
      else if (m.mistakeType === "link") cur.hasLink = true;
      map.set(m.globalAyahNumber, cur);
    }
    return map;
  }, [mistakesData]);

  useEffect(() => {
    let cancelled = false;
    getAyahIndex()
      .then((entries) => {
        if (!cancelled) setIndex(entries);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const normalisedQuery = useMemo(() => normaliseSearchQuery(search), [search]);

  const pageFrom = useMemo(() => {
    const n = parseInt(pageFromStr, 10);
    return Number.isFinite(n) && n >= 1 && n <= TOTAL_PAGES ? n : null;
  }, [pageFromStr]);
  const pageTo = useMemo(() => {
    const n = parseInt(pageToStr, 10);
    return Number.isFinite(n) && n >= 1 && n <= TOTAL_PAGES ? n : null;
  }, [pageToStr]);

  const filtered = useMemo<AyahIndexEntry[]>(() => {
    if (!index) return [];
    const surahNum = surahFilter === "all" ? null : parseInt(surahFilter, 10);
    const juzNum = juzFilter === "all" ? null : parseInt(juzFilter, 10);
    const pageMin = pageFrom != null && pageTo != null ? Math.min(pageFrom, pageTo) : pageFrom ?? null;
    const pageMax = pageFrom != null && pageTo != null ? Math.max(pageFrom, pageTo) : pageTo ?? null;
    const out: AyahIndexEntry[] = [];
    for (const a of index) {
      if (surahNum != null && a.surahNumber !== surahNum) continue;
      if (juzNum != null && a.juzNumber !== juzNum) continue;
      if (pageMin != null && a.pageNumber < pageMin) continue;
      if (pageMax != null && a.pageNumber > pageMax) continue;
      if (normalisedQuery && !a.searchText.includes(normalisedQuery)) continue;
      if (markFilter !== "all") {
        const mark = markByGlobal.get(a.globalAyahNumber);
        if (markFilter === "marked" && !mark) continue;
        if (markFilter === "memorization" && !mark?.hasMem) continue;
        if (markFilter === "link" && !mark?.hasLink) continue;
      }
      out.push(a);
    }
    return out;
  }, [index, surahFilter, juzFilter, pageFrom, pageTo, normalisedQuery, markFilter, markByGlobal]);

  // Reset pagination whenever the filter set changes.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [surahFilter, juzFilter, pageFromStr, pageToStr, normalisedQuery, markFilter]);

  const hasFilter =
    !!normalisedQuery ||
    surahFilter !== "all" ||
    juzFilter !== "all" ||
    pageFromStr !== "" ||
    pageToStr !== "" ||
    markFilter !== "all";

  const clearFilters = () => {
    setSearch("");
    setSurahFilter("all");
    setJuzFilter("all");
    setPageFromStr("");
    setPageToStr("");
    setMarkFilter("all");
  };

  const visible = filtered.slice(0, visibleCount);
  const isLoading = index === null && !loadError;

  return (
    <div className="space-y-4" data-testid="ayahs-list-page">
      <div>
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          {t("ayahsList.title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t("ayahsList.subtitle")}</p>
      </div>

      <Card className="border shadow-sm">
        <CardContent className="px-4 py-3 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("ayahsList.searchPlaceholder")}
              className="ps-9"
              dir="auto"
              data-testid="ayahs-search-input"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={surahFilter} onValueChange={setSurahFilter}>
              <SelectTrigger className="w-44" data-testid="ayahs-filter-surah">
                <SelectValue placeholder={t("ayahsList.allSurah")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">{t("ayahsList.allSurah")}</SelectItem>
                {SURAHS.map((s) => (
                  <SelectItem key={s.number} value={String(s.number)}>
                    {s.number}. {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={juzFilter} onValueChange={setJuzFilter}>
              <SelectTrigger className="w-36" data-testid="ayahs-filter-juz">
                <SelectValue placeholder={t("ayahsList.allJuz")} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">{t("ayahsList.allJuz")}</SelectItem>
                {Array.from({ length: 30 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {t("pageList.filters.juzN", { n: i + 1 })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{t("ayahsList.pages")}</span>
              <Input
                type="number"
                min={1}
                max={TOTAL_PAGES}
                value={pageFromStr}
                onChange={(e) => setPageFromStr(e.target.value)}
                className="w-20 text-center"
                placeholder={t("ayahsList.from")}
                data-testid="ayahs-filter-page-from"
              />
              <span className="text-xs text-muted-foreground">{t("ayahsList.toSep")}</span>
              <Input
                type="number"
                min={1}
                max={TOTAL_PAGES}
                value={pageToStr}
                onChange={(e) => setPageToStr(e.target.value)}
                className="w-20 text-center"
                placeholder={t("ayahsList.to")}
                data-testid="ayahs-filter-page-to"
              />
            </div>

            <Select value={markFilter} onValueChange={(v) => setMarkFilter(v as MarkFilter)}>
              <SelectTrigger className="w-44" data-testid="ayahs-filter-mark">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("ayahsList.markFilterAll")}</SelectItem>
                <SelectItem value="marked">{t("ayahsList.markFilterMarked")}</SelectItem>
                <SelectItem value="memorization">{t("ayahsList.markFilterMemorization")}</SelectItem>
                <SelectItem value="link">{t("ayahsList.markFilterLink")}</SelectItem>
              </SelectContent>
            </Select>

            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-xs"
                data-testid="ayahs-clear-filters"
              >
                <X className="w-3.5 h-3.5 me-1" />
                {t("common.clear")}
              </Button>
            )}

            <div className="ms-auto text-xs text-muted-foreground tabular-nums" data-testid="ayahs-count">
              {t("ayahsList.matchCount", { count: filtered.length })}
            </div>
          </div>
        </CardContent>
      </Card>

      {loadError ? (
        <Card className="border shadow-sm">
          <CardContent className="py-12 text-center text-sm text-muted-foreground" data-testid="ayahs-load-error">
            {t("ayahsList.loadError")}
          </CardContent>
        </Card>
      ) : isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="ayahs-loading">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border shadow-sm">
          <CardContent className="py-12 text-center" data-testid="ayahs-empty">
            <Sparkles className="w-10 h-10 mx-auto opacity-30 mb-2" />
            <p className="text-sm font-medium">{t("ayahsList.empty")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("ayahsList.emptyHint")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="ayahs-grid">
            {visible.map((a) => {
              const mark = markByGlobal.get(a.globalAyahNumber);
              // Memorization is the more severe of the two and wins the
              // visual treatment when both are present; the badges below
              // still render independently so the user sees both marks.
              const dominant = mark?.hasMem ? "memorization" : mark?.hasLink ? "link" : null;
              return (
                <Link
                  key={a.globalAyahNumber}
                  href={`/ayahs/${a.globalAyahNumber}`}
                  data-testid={`ayah-card-${a.globalAyahNumber}`}
                  className="group block"
                >
                  <Card
                    className={`h-full border shadow-sm transition-colors hover:border-primary/60 hover:bg-muted/40 ${
                      dominant === "memorization"
                        ? "border-rose-300/70 bg-rose-50/40 dark:bg-rose-950/20"
                        : dominant === "link"
                        ? "border-amber-300/70 bg-amber-50/40 dark:bg-amber-950/20"
                        : ""
                    }`}
                    data-testid={`ayah-card-card-${a.globalAyahNumber}`}
                    data-mark={dominant ?? "none"}
                  >
                    <CardContent className="p-4 flex flex-col gap-3 h-full">
                      <p
                        className="text-lg leading-loose text-right text-foreground line-clamp-3"
                        dir="rtl"
                        style={{ fontFamily: "'Noto Naskh Arabic', 'Amiri', serif" }}
                      >
                        {a.text}
                      </p>
                      <div className="mt-auto flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                          {a.surahNumber}. {a.surahName} · {a.numberInSurah}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
                          {t("common.juz")} {a.juzNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">
                          {t("common.page")} {a.pageNumber}
                        </span>
                        {mark?.hasMem && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-200"
                            data-testid={`ayah-card-mark-mem-${a.globalAyahNumber}`}
                          >
                            <X className="w-3 h-3" />
                            {t("ayahsList.markBadgeMemorization")}
                          </span>
                        )}
                        {mark?.hasLink && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200"
                            data-testid={`ayah-card-mark-link-${a.globalAyahNumber}`}
                          >
                            <Link2 className="w-3 h-3" />
                            {t("ayahsList.markBadgeLink")}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
          {visible.length < filtered.length && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                data-testid="ayahs-load-more"
              >
                {t("ayahsList.loadMore", { remaining: filtered.length - visible.length })}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
