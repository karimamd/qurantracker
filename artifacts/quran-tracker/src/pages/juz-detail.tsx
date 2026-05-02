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
import { Rob3FirstAyahPreview } from "@/components/rob3-first-ayah-preview";
import { useTranslation } from "react-i18next";

export default function JuzDetail() {
  const params = useParams<{ id: string }>();
  const juzNumber = parseInt(params.id || "1", 10);
  const { t } = useTranslation();
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

  if (!detail) return <div>{t("juzDetail.notFound")}</div>;

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
            <ArrowLeft className="w-4 h-4 me-1 rtl:rotate-180" /> {t("common.back")}
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-semibold">{detail.name}</h2>
          <p className="text-sm text-muted-foreground">{t("juzList.pagesRange", { start: detail.startPage, end: detail.endPage })}</p>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-3">{t("juzDetail.parts")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {detail.rob3s.map(rob3 => (
            <Card key={rob3.rob3Number} className="border shadow-sm" data-testid={`rob3-card-${rob3.rob3Number}`}>
              <CardContent className="pt-4 pb-3 px-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-1.5 h-6 rounded-full ${getQualityColor(rob3.averageQuality)}`} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{t("juzDetail.partLabel", { n: ((rob3.rob3Number - 1) % 8) + 1 })}</div>
                    <div className="text-xs text-muted-foreground">{t("juzList.pagesRange", { start: rob3.startPage, end: rob3.endPage })}</div>
                    <Rob3FirstAyahPreview
                      rob3Number={rob3.rob3Number}
                      className="block text-xs mt-1 max-w-full"
                      wordCount={5}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <QualityBadge quality={rob3.averageQuality} />
                  <span className="text-xs text-muted-foreground">{t("juzDetail.inScope", { done: rob3.pagesInScope, total: rob3.totalPages })}</span>
                </div>
                {rob3.pagesOverdue > 0 && (
                  <div className="text-xs text-rose-600 font-medium mt-1">{t("juzDetail.overdue", { count: rob3.pagesOverdue })}</div>
                )}
                {rob3.totalMistakes != null && rob3.totalMistakes > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">{t("juzDetail.totalMistakes", { count: rob3.totalMistakes })}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium mb-3">{t("juzDetail.pages")}</h3>
        <Card className="border shadow-sm overflow-hidden">
          <div className="divide-y">
            {detail.pages.map(page => (
              <PageRow
                key={page.pageNumber}
                pageNumber={page.pageNumber}
                customName={page.customName}
                quality={page.quality}
                effectiveQuality={page.effectiveQuality}
                qualityDowngrades={page.qualityDowngrades}
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
