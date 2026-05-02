import {
  useGetJuzDetail,
  getGetJuzDetailQueryKey,
  getListPageProgressQueryKey,
  getGetProgressOverviewQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QualityBadge, getQualityColor } from "@/components/quality-badge";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageRow } from "@/components/page-row";

export default function JuzDetail() {
  const params = useParams<{ id: string }>();
  const juzNumber = parseInt(params.id || "1", 10);
  const { data: detail, isLoading } = useGetJuzDetail(juzNumber, {
    query: { enabled: !!juzNumber, queryKey: getGetJuzDetailQueryKey(juzNumber) },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!detail) return <div>Juz not found</div>;

  const invalidateKeys = [
    getGetJuzDetailQueryKey(juzNumber),
    getListPageProgressQueryKey(),
    getGetProgressOverviewQueryKey(),
  ];

  return (
    <div className="space-y-6" data-testid="juz-detail-page">
      <div className="flex items-center gap-3">
        <Link href="/juz">
          <Button variant="ghost" size="sm" data-testid="back-to-juz">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-semibold">{detail.name}</h2>
          <p className="text-sm text-muted-foreground">Pages {detail.startPage} - {detail.endPage}</p>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-3">Parts (Rob3)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {detail.rob3s.map(rob3 => (
            <Card key={rob3.rob3Number} className="border shadow-sm" data-testid={`rob3-card-${rob3.rob3Number}`}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-1.5 h-6 rounded-full ${getQualityColor(rob3.averageQuality)}`} />
                  <div>
                    <div className="text-sm font-medium">Part {((rob3.rob3Number - 1) % 8) + 1}</div>
                    <div className="text-xs text-muted-foreground">Pages {rob3.startPage}-{rob3.endPage}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <QualityBadge quality={rob3.averageQuality} />
                  <span className="text-xs text-muted-foreground">{rob3.pagesInScope}/{rob3.totalPages} in scope</span>
                </div>
                {rob3.pagesOverdue > 0 && (
                  <div className="text-xs text-rose-600 font-medium mt-1">{rob3.pagesOverdue} overdue</div>
                )}
                {rob3.totalMistakes != null && rob3.totalMistakes > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">{rob3.totalMistakes} total mistakes</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-3">Pages</h3>
        <Card className="border shadow-sm overflow-hidden">
          <div className="divide-y">
            {detail.pages.map(page => (
              <PageRow
                key={page.pageNumber}
                pageNumber={page.pageNumber}
                customName={page.customName}
                quality={page.quality}
                status={page.status}
                inScope={page.inScope}
                lastRecited={page.lastRecited}
                surahLabel={page.surahs?.split(",")[0]?.trim() ?? null}
                juzNumber={juzNumber}
                invalidateKeys={invalidateKeys}
                testIdPrefix="page-cell"
              />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
