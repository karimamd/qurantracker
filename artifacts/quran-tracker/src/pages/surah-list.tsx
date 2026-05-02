import { useListSurahProgress } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QualityBadge, getQualityColor } from "@/components/quality-badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";

export default function SurahList() {
  const { data: surahs, isLoading } = useListSurahProgress();
  const [search, setSearch] = useState("");
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">{t("surahList.title")}</h2>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const filtered = surahs?.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.arabicName.includes(search) ||
    s.surahNumber.toString() === search
  ) || [];

  return (
    <div className="space-y-4" data-testid="surah-list-page">
      <div>
        <h2 className="text-2xl font-semibold">{t("surahList.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("surahList.subtitle")}</p>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder={t("surahList.searchPlaceholder")}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ps-9"
          data-testid="surah-search"
        />
      </div>
      <div className="space-y-2">
        {filtered.map(surah => {
          const scopePct = surah.totalPages > 0 ? Math.round((surah.pagesInScope / surah.totalPages) * 100) : 0;
          return (
            <Link key={surah.surahNumber} href={`/surah/${surah.surahNumber}`}>
              <Card
                className="border shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
                data-testid={`surah-card-${surah.surahNumber}`}
              >
                <CardContent className="py-3 px-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1.5 h-8 rounded-full shrink-0 ${getQualityColor(surah.averageQuality)}`} />
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                        {surah.surahNumber}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{surah.name}</span>
                          <span className="text-sm font-serif text-muted-foreground" dir="rtl" lang="ar">{surah.arabicName}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {t("surahList.pagesRange", { start: surah.startPage, end: surah.endPage, total: surah.totalPages })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${scopePct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right">{surah.pagesInScope}/{surah.totalPages}</span>
                        </div>
                        {surah.pagesOverdue > 0 && (
                          <span className="text-xs text-rose-600 font-medium">{t("surahDetail.overdue", { count: surah.pagesOverdue })}</span>
                        )}
                      </div>
                      <QualityBadge quality={surah.averageQuality} />
                      <ChevronRight className="w-4 h-4 text-muted-foreground rtl:rotate-180" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
