import {
  useGetSurahDetail,
  getGetSurahDetailQueryKey,
  getListSurahProgressQueryKey,
  getListPageProgressQueryKey,
  getGetProgressOverviewQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageRow } from "@/components/page-row";

export default function SurahDetail() {
  const params = useParams<{ id: string }>();
  const surahNumber = parseInt(params.id || "1", 10);
  const { data: detail, isLoading } = useGetSurahDetail(surahNumber, {
    query: { enabled: !!surahNumber, queryKey: getGetSurahDetailQueryKey(surahNumber) },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!detail) return <div>Surah not found</div>;

  const invalidateKeys = [
    getGetSurahDetailQueryKey(surahNumber),
    getListSurahProgressQueryKey(),
    getListPageProgressQueryKey(),
    getGetProgressOverviewQueryKey(),
  ];

  return (
    <div className="space-y-6" data-testid="surah-detail-page">
      <div className="flex items-center gap-3">
        <Link href="/surah">
          <Button variant="ghost" size="sm" data-testid="back-to-surah">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-semibold truncate">{detail.name}</h2>
            <span className="text-lg font-serif text-muted-foreground">{detail.arabicName}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Pages {detail.startPage} - {detail.endPage} ({detail.totalPages} pages)
            {detail.pagesInScope > 0 && <> · {detail.pagesInScope} in scope</>}
            {detail.pagesOverdue > 0 && <span className="text-rose-600 font-medium"> · {detail.pagesOverdue} overdue</span>}
          </p>
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
                invalidateKeys={invalidateKeys}
                testIdPrefix="surah-page-cell"
              />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
