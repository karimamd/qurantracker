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
import { ArrowLeft, Check, X } from "lucide-react";
import { format } from "date-fns";
import { PageLabel } from "@/components/page-label";

type Quality = "excellent" | "good" | "hard" | "relearn";

const QUALITIES: { value: Quality; label: string; completed: boolean }[] = [
  { value: "excellent", label: "Excellent", completed: true },
  { value: "good",      label: "Good",      completed: true },
  { value: "hard",      label: "Hard",      completed: false },
  { value: "relearn",   label: "Relearn",   completed: false },
];

const qualityStyle: Record<Quality, { active: string; hover: string }> = {
  excellent: { active: "bg-emerald-500 border-emerald-500 text-white", hover: "hover:border-emerald-300 hover:text-emerald-700" },
  good:      { active: "bg-sky-500 border-sky-500 text-white",         hover: "hover:border-sky-300 hover:text-sky-700" },
  hard:      { active: "bg-amber-500 border-amber-500 text-white",     hover: "hover:border-amber-300 hover:text-amber-700" },
  relearn:   { active: "bg-rose-500 border-rose-500 text-white",       hover: "hover:border-rose-300 hover:text-rose-700" },
};

const dotStyle: Record<string, string> = {
  excellent: "border-emerald-500 bg-emerald-500",
  good:      "border-emerald-500 bg-emerald-500",
  hard:      "border-amber-400 bg-amber-400",
  relearn:   "border-amber-400 bg-amber-400",
};

const rowStyle: Record<string, string> = {
  excellent: "bg-emerald-50/60",
  good:      "bg-emerald-50/60",
  hard:      "bg-amber-50/40",
  relearn:   "bg-amber-50/40",
};

export default function HomeworkDetail() {
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
        onError: () => toast({ title: "Failed to update page", variant: "destructive" }),
      }
    );
  };

  const handleClear = (itemId: number) => {
    updateItem.mutate(
      { homeworkId, itemId, data: { completed: false } },
      {
        onSuccess: invalidate,
        onError: () => toast({ title: "Failed to clear page", variant: "destructive" }),
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

  if (!detail) return <div>Not found</div>;

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
                <span className="ml-1 text-amber-600">· {needsWorkCount} needs work</span>
              )}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {items.map(item => {
              const q = item.quality as Quality | null | undefined;
              const hasQuality = !!q;
              const isCompleted = item.completed;
              const isLastStopped = item.id === lastStoppedId;
              const lastRecitedAt = item.completedAt
                ? format(new Date(item.completedAt), "MMM d, h:mm a")
                : null;
              const weekCount = item.weekCount ?? 0;

              return (
                <div
                  key={item.id}
                  className={`px-4 py-3 transition-colors relative ${
                    isLastStopped
                      ? "bg-violet-50/70 border-l-4 border-l-violet-400"
                      : hasQuality
                      ? (rowStyle[q] ?? "")
                      : "hover:bg-muted/30"
                  }`}
                  data-testid={`hw-item-${item.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        hasQuality ? (dotStyle[q] ?? "border-muted-foreground/30 bg-transparent") : "border-muted-foreground/30 bg-transparent"
                      }`}>
                        {hasQuality && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm font-medium ${isCompleted ? "text-muted-foreground line-through" : ""}`}>
                            <PageLabel
                              pageNumber={item.pageNumber}
                              customName={item.customName}
                              homeworkId={homeworkId}
                              prefixClassName="text-sm font-medium"
                              nameClassName="text-base"
                            />
                          </span>
                          <Badge variant="outline" className="text-xs py-0">{item.type}</Badge>
                          {isLastStopped && (
                            <Badge className="text-xs py-0 bg-violet-500 hover:bg-violet-500 text-white border-0" data-testid={`hw-last-stopped-${item.id}`}>
                              Last stopped
                            </Badge>
                          )}
                          {weekCount > 0 && (
                            <span
                              className="text-xs font-semibold bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full border border-sky-200"
                              data-testid={`hw-week-count-${item.id}`}
                              title={`Recited ${weekCount}× in the past 7 days`}
                            >
                              {weekCount}× this week
                            </span>
                          )}
                        </div>
                        {lastRecitedAt && (
                          <div className="text-xs text-muted-foreground mt-0.5" data-testid={`hw-last-recited-${item.id}`}>
                            Last recited: {lastRecitedAt}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-auto">
                      {QUALITIES.map(({ value, label: ql }) => {
                        const isActive = q === value;
                        const style = qualityStyle[value];
                        return (
                          <button
                            key={value}
                            onClick={() => handleQualitySelect(item.id, value)}
                            disabled={updateItem.isPending}
                            className={`text-xs px-2 py-1 rounded-md border font-medium transition-all ${
                              isActive ? style.active : `border-border bg-background text-muted-foreground ${style.hover}`
                            }`}
                            data-testid={`hw-quality-btn-${item.id}-${value}`}
                          >
                            {ql}
                          </button>
                        );
                      })}
                      {hasQuality && (
                        <button
                          onClick={() => handleClear(item.id)}
                          disabled={updateItem.isPending}
                          className="ml-1 w-6 h-6 flex items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                          aria-label="Clear quality"
                          data-testid={`hw-clear-btn-${item.id}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
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
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-semibold">{detail.title}</h2>
          <p className="text-sm text-muted-foreground">
            Due: {new Date(detail.dueDate).toLocaleDateString()}
          </p>
        </div>
      </div>

      {renderItems(memorizeItems, "Pages to Memorize")}
      {renderItems(reviseItems, "Pages to Revise")}

      {detail.items.length === 0 && (
        <Card className="border shadow-sm">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">No items in this homework session.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
