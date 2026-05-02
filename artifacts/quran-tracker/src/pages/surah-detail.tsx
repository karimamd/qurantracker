import {
  useGetSurahDetail,
  getGetSurahDetailQueryKey,
  getListSurahProgressQueryKey,
  getListPageProgressQueryKey,
  getGetProgressOverviewQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { QualityBadge } from "@/components/quality-badge";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageQualityButtons } from "@/components/page-quality-buttons";

export default function SurahDetail() {
  const params = useParams<{ id: string }>();
  const surahNumber = parseInt(params.id || "1", 10);
  console.log("[SurahDetail] render", { params, surahNumber, location: window.location.href });
  const { data: detail, isLoading } = useGetSurahDetail(surahNumber, {
    query: { enabled: !!surahNumber, queryKey: getGetSurahDetailQueryKey(surahNumber) },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (!detail) return <div>Surah not found</div>;

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {detail.pages.map(page => (
            <div
              key={page.pageNumber}
              className={`p-2.5 rounded-lg border transition-all ${
                page.status === "overdue"
                  ? "bg-rose-50 border-rose-200"
                  : page.status === "due_soon"
                  ? "bg-amber-50 border-amber-200"
                  : page.status === "on_track"
                  ? "bg-emerald-50 border-emerald-200"
                  : page.status === "not_started"
                  ? "bg-blue-50 border-blue-200"
                  : "bg-gray-50 border-gray-100"
              }`}
              data-testid={`surah-page-cell-${page.pageNumber}`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-sm">{page.pageNumber}</span>
                  <span className="text-xs text-muted-foreground truncate">{page.surahs.split(",")[0]}</span>
                </div>
                <QualityBadge quality={page.quality} />
              </div>
              {page.inScope ? (
                <PageQualityButtons
                  pageNumber={page.pageNumber}
                  currentQuality={page.quality}
                  size="xs"
                  compact
                  className="justify-between"
                  invalidateKeys={[
                    getGetSurahDetailQueryKey(surahNumber),
                    getListSurahProgressQueryKey(),
                    getListPageProgressQueryKey(),
                    getGetProgressOverviewQueryKey(),
                  ]}
                />
              ) : (
                <div className="text-[10px] text-muted-foreground italic text-center py-1">Not in scope</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
