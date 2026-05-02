import {
  useGetHomework,
  useUpdateHomeworkItem,
  getGetHomeworkQueryKey,
  getListHomeworkQueryKey,
  getGetProgressOverviewQueryKey,
  getListPageProgressQueryKey,
} from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, X } from "lucide-react";
import { PageRow } from "@/components/page-row";
import { type Quality, QUALITIES } from "@/lib/quality";
import { useTranslation } from "react-i18next";

export default function HomeworkDetail() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const homeworkId = parseInt(params.id || "0", 10);
  const { data: detail, isLoading } = useGetHomework(homeworkId, {
    query: { enabled: !!homeworkId, queryKey: getGetHomeworkQueryKey(homeworkId) },
  });
  const updateItem = useUpdateHomeworkItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetHomeworkQueryKey(homeworkId) });
    queryClient.invalidateQueries({ queryKey: getListHomeworkQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
  };

  const handleQualitySelect = (itemId: number, quality: Quality) => {
    const isCompleted = QUALITIES.find(q => q.value === quality)!.completed;
    updateItem.mutate(
      { homeworkId, itemId, data: { completed: isCompleted, quality } },
      {
        onSuccess: invalidate,
        onError: () => toast({ title: t("homework.updateFailed"), variant: "destructive" }),
      }
    );
  };

  const handleClear = (itemId: number) => {
    updateItem.mutate(
      { homeworkId, itemId, data: { completed: false } },
      {
        onSuccess: invalidate,
        onError: () => toast({ title: t("homework.clearFailed"), variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!detail) return <div>{t("common.notFound")}</div>;

  const memorizeItems = detail.items.filter(i => i.type === "memorize");
  const reviseItems   = detail.items.filter(i => i.type === "revise");

  const lastStoppedId = detail.items.reduce<number | null>((best, item) => {
    if (!item.completedAt) return best;
    if (best === null) return item.id;
    const prev = detail.items.find(i => i.id === best);
    const prevTime = prev?.completedAt ? new Date(prev.completedAt).getTime() : 0;
    return new Date(item.completedAt).getTime() > prevTime ? item.id : best;
  }, null);

  const renderItems = (items: typeof detail.items, label: string) => {
    if (items.length === 0) return null;

    const doneCount = items.filter(i => i.completed).length;
    const needsWorkCount = items.filter(i => !i.completed && i.quality && ["hard", "relearn"].includes(i.quality)).length;

    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            {label}
            <span className="font-normal text-sm text-muted-foreground">
              {doneCount}/{items.length}
              {needsWorkCount > 0 && (
                <span className="ms-1 text-amber-600">· {t("homework.needsWork", { count: needsWorkCount })}</span>
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {items.map(item => {
              const hasQuality = !!item.quality;
              const isLastStopped = item.id === lastStoppedId;
              return (
                <PageRow
                  key={item.id}
                  pageNumber={item.pageNumber}
                  customName={item.customName}
                  quality={item.quality ?? null}
                  status="on_track"
                  inScope={true}
                  lastRecited={item.completedAt ?? null}
                  weekCount={item.weekCount ?? 0}
                  homeworkId={homeworkId}
                  highlight={isLastStopped}
                  highlightLabel={isLastStopped ? t("homework.lastStopped") : undefined}
                  onQualitySelect={(q) => handleQualitySelect(item.id, q)}
                  qualityPending={updateItem.isPending}
                  testIdPrefix="hw-item"
                  rowId={item.id}
                  extraBadges={
                    <Badge variant="outline" className="text-xs py-0">{item.type === "memorize" ? t("homework.memorize") : t("homework.revise")}</Badge>
                  }
                  extraActions={
                    hasQuality ? (
                      <button
                        onClick={() => handleClear(item.id)}
                        disabled={updateItem.isPending}
                        className="ml-1 w-6 h-6 flex items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                        aria-label={t("homework.clearQuality")}
                        data-testid={`hw-clear-btn-${item.id}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    ) : null
                  }
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6" data-testid="homework-detail-page">
      <div className="flex items-center gap-3">
        <Link href="/homework">
          <Button variant="ghost" size="sm" data-testid="back-to-homework">
            <ArrowLeft className="w-4 h-4 me-1 rtl:rotate-180" /> {t("common.back")}
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-semibold">{detail.title}</h2>
          <p className="text-sm text-muted-foreground">
            {t("common.due")}: {new Date(detail.dueDate).toLocaleDateString()}
          </p>
        </div>
      </div>

      {renderItems(memorizeItems, t("homework.pagesToMemorize"))}
      {renderItems(reviseItems, t("homework.pagesToRevise"))}

      {detail.items.length === 0 && (
        <Card className="border shadow-sm">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">{t("homework.noItems")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
