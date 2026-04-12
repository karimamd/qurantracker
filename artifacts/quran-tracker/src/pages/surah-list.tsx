import { useListSurahProgress } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QualityBadge, getQualityColor } from "@/components/quality-badge";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Search } from "lucide-react";

export default function SurahList() {
  const { data: surahs, isLoading } = useListSurahProgress();
  const [search, setSearch] = useState("");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Surah Overview</h2>
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
        <h2 className="text-2xl font-semibold">Surah Overview</h2>
        <p className="text-sm text-muted-foreground mt-1">All 114 Surahs</p>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search surah..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          data-testid="surah-search"
        />
      </div>
      <div className="space-y-2">
        {filtered.map(surah => {
          const scopePct = surah.totalPages > 0 ? Math.round((surah.pagesInScope / surah.totalPages) * 100) : 0;
          return (
            <Card key={surah.surahNumber} className="border shadow-sm" data-testid={`surah-card-${surah.surahNumber}`}>
              <CardContent className="py-3 px-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-1.5 h-8 rounded-full ${getQualityColor(surah.averageQuality)}`} />
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
                      {surah.surahNumber}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{surah.name}</span>
                        <span className="text-sm font-serif text-muted-foreground">{surah.arabicName}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Pages {surah.startPage}-{surah.endPage} ({surah.totalPages} pages)
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${scopePct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground w-12 text-right">{surah.pagesInScope}/{surah.totalPages}</span>
                      </div>
                      {surah.pagesOverdue > 0 && (
                        <span className="text-xs text-rose-600 font-medium">{surah.pagesOverdue} overdue</span>
                      )}
                    </div>
                    <QualityBadge quality={surah.averageQuality} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
