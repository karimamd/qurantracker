import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useGetMistakes } from "@workspace/api-client-react";
import type { Mistake } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Link2, X, Eye, FileText, BookMarked } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";

type FilterType = "all" | "memorization" | "link";

const TYPE_STYLE: Record<"memorization" | "link", { chip: string; icon: typeof X }> = {
  memorization: {
    chip: "bg-rose-100 text-rose-700 border-rose-200",
    icon: X,
  },
  link: {
    chip: "bg-amber-100 text-amber-800 border-amber-200",
    icon: Link2,
  },
};

export default function MistakesPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<FilterType>("all");
  const { data, isLoading, isError } = useGetMistakes(
    filter === "all" ? { limit: 200 } : { limit: 200, type: filter }
  );
  const TYPE_LABEL: Record<"memorization" | "link", string> = {
    memorization: t("mistakes.filterMemorization"),
    link: t("mistakes.filterLink"),
  };

  const summary = data?.summary;
  const mistakes: Mistake[] = data?.mistakes ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, Mistake[]>();
    for (const m of mistakes) {
      const day = format(new Date(m.recitedAt), "EEEE, MMM d, yyyy");
      const arr = map.get(day) ?? [];
      arr.push(m);
      map.set(day, arr);
    }
    return Array.from(map.entries());
  }, [mistakes]);

  return (
    <div className="space-y-4 max-w-4xl mx-auto" data-testid="mistakes-page">
      <div>
        <h2 className="text-2xl font-semibold flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
          {t("mistakes.title")}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{t("mistakes.subtitle")}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="mistakes-summary">
        <SummaryCard label={t("mistakes.summary.total")} value={summary?.total ?? 0} loading={isLoading} testId="stat-total" />
        <SummaryCard
          label={t("mistakes.summary.memorization")}
          value={summary?.memorizationCount ?? 0}
          loading={isLoading}
          accent="rose"
          icon={X}
          testId="stat-memorization"
        />
        <SummaryCard
          label={t("mistakes.summary.link")}
          value={summary?.linkCount ?? 0}
          loading={isLoading}
          accent="amber"
          icon={Link2}
          testId="stat-link"
        />
        <SummaryCard
          label={t("mistakes.summary.pages")}
          value={summary?.uniquePages ?? 0}
          loading={isLoading}
          icon={FileText}
          testId="stat-pages"
        />
      </div>

      {/* Filter */}
      <Card className="border shadow-sm">
        <CardContent className="px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground me-1">{t("mistakes.filter")}</span>
            {(["all", "memorization", "link"] as FilterType[]).map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => setFilter(opt)}
                className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${
                  filter === opt
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
                data-testid={`filter-${opt}`}
              >
                {opt === "all" ? t("mistakes.filterAll") : TYPE_LABEL[opt]}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="border shadow-sm">
        <CardContent className="px-4 py-3">
          {isLoading ? (
            <div className="space-y-3" data-testid="mistakes-loading">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-8 text-center text-sm text-muted-foreground" data-testid="mistakes-error">
              {t("mistakes.loadError")}
            </div>
          ) : mistakes.length === 0 ? (
            <div className="py-12 text-center" data-testid="mistakes-empty">
              <AlertTriangle className="w-10 h-10 mx-auto opacity-30 mb-2" />
              <p className="text-sm font-medium">{t("mistakes.empty")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("mistakes.emptyHint")}</p>
              <Link
                href="/reader"
                className="inline-flex items-center gap-1.5 mt-4 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:opacity-90"
              >
                <BookMarked className="w-3.5 h-3.5" />
                {t("mistakes.openReader")}
              </Link>
            </div>
          ) : (
            <div className="space-y-5" data-testid="mistakes-list">
              {grouped.map(([day, items]) => (
                <div key={day}>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {day}
                  </div>
                  <div className="space-y-2">
                    {items.map(m => {
                      const style = TYPE_STYLE[m.mistakeType];
                      const Icon = style.icon;
                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-md border bg-background hover:bg-muted/40 transition-colors flex-wrap"
                          data-testid={`mistake-row-${m.id}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${style.chip}`}
                            >
                              <Icon className="w-3 h-3" />
                              {TYPE_LABEL[m.mistakeType]}
                            </span>
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {m.surahName} <span className="text-muted-foreground">·</span> {t("mistakes.ayahLine", { n: m.ayahNumberInSurah })}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {t("mistakes.pageTime", { page: m.pageNumber, time: format(new Date(m.recitedAt), "h:mm a") })}
                              </div>
                            </div>
                          </div>
                          <Link
                            href={`/reader/${m.pageNumber}?practice=${m.globalAyahNumber}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border bg-background text-xs font-medium hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors shrink-0"
                            data-testid={`mistake-practice-${m.id}`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            {t("mistakes.practice")}
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  loading,
  accent,
  icon: Icon,
  testId,
}: {
  label: string;
  value: number;
  loading: boolean;
  accent?: "rose" | "amber";
  icon?: typeof X;
  testId?: string;
}) {
  const accentClass =
    accent === "rose"
      ? "text-rose-700"
      : accent === "amber"
      ? "text-amber-700"
      : "text-foreground";
  return (
    <Card className="border shadow-sm" data-testid={testId}>
      <CardContent className="px-4 py-3">
        <div className="flex items-center justify-between gap-1">
          <div className="text-xs text-muted-foreground">{label}</div>
          {Icon ? <Icon className={`w-4 h-4 ${accentClass} opacity-60`} /> : null}
        </div>
        {loading ? (
          <Skeleton className="h-7 w-12 mt-1" />
        ) : (
          <div className={`text-2xl font-bold tabular-nums ${accentClass}`}>{value}</div>
        )}
      </CardContent>
    </Card>
  );
}
