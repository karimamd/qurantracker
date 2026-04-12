import { useListJuzProgress } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QualityBadge, getQualityColor } from "@/components/quality-badge";
import { ChevronRight } from "lucide-react";

export default function JuzList() {
  const { data: juzList, isLoading } = useListJuzProgress();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Juz Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="juz-list-page">
      <div>
        <h2 className="text-2xl font-semibold">Juz Overview</h2>
        <p className="text-sm text-muted-foreground mt-1">All 30 Juz at a glance</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {juzList?.map(juz => {
          const scopePct = juz.totalPages > 0 ? Math.round((juz.pagesInScope / juz.totalPages) * 100) : 0;
          const overduePct = juz.pagesInScope > 0 ? Math.round((juz.pagesOverdue / juz.pagesInScope) * 100) : 0;
          return (
            <Link key={juz.juzNumber} href={`/juz/${juz.juzNumber}`}>
              <Card className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer group" data-testid={`juz-card-${juz.juzNumber}`}>
                <CardContent className="pt-4 pb-4 px-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-8 rounded-full ${getQualityColor(juz.averageQuality)}`} />
                      <div>
                        <div className="font-semibold text-sm">{juz.name}</div>
                        <div className="text-xs text-muted-foreground">Pages {juz.startPage}-{juz.endPage}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${scopePct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{juz.pagesInScope}/{juz.totalPages}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <QualityBadge quality={juz.averageQuality} />
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {juz.pagesOverdue > 0 && (
                        <span className="text-rose-600 font-medium">{juz.pagesOverdue} overdue</span>
                      )}
                      {juz.lastRecited && (
                        <span>Last: {new Date(juz.lastRecited).toLocaleDateString()}</span>
                      )}
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
