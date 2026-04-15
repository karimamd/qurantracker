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
import { ArrowLeft, Check } from "lucide-react";

type Quality = "excellent" | "good" | "hard" | "relearn";

const QUALITIES: { value: Quality; label: string; checked: boolean }[] = [
  { value: "excellent", label: "Excellent", checked: true },
  { value: "good", label: "Good", checked: true },
  { value: "hard", label: "Hard", checked: false },
  { value: "relearn", label: "Relearn", checked: false },
];

const qualityColors: Record<Quality, { active: string; text: string }> = {
  excellent: { active: "bg-emerald-500 border-emerald-500 text-white", text: "text-emerald-700" },
  good:      { active: "bg-sky-500 border-sky-500 text-white",        text: "text-sky-700" },
  hard:      { active: "bg-amber-500 border-amber-500 text-white",    text: "text-amber-700" },
  relearn:   { active: "bg-rose-500 border-rose-500 text-white",      text: "text-rose-700" },
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

  const handleQualitySelect = (itemId: number, newQuality: Quality, currentQuality: string | null | undefined) => {
    const isToggleOff = currentQuality === newQuality;
    const isChecked = !isToggleOff && QUALITIES.find(q => q.value === newQuality)?.checked;

    updateItem.mutate(
      {
        homeworkId,
        itemId,
        data: isToggleOff
          ? { completed: false }
          : {
              completed: !!isChecked,
              quality: newQuality,
            },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetHomeworkQueryKey(homeworkId) });
          queryClient.invalidateQueries({ queryKey: getListHomeworkQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
        },
        onError: () => {
          toast({ title: "Failed to update page", variant: "destructive" });
        },
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
  const reviseItems = detail.items.filter(i => i.type === "revise");

  const renderItems = (items: typeof detail.items, label: string) => {
    if (items.length === 0) return null;

    const doneCount = items.filter(i => i.completed).length;
    const hardCount = items.filter(i => !i.completed && i.quality && ["hard", "relearn"].includes(i.quality)).length;

    return (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            {label}
            <span className="font-normal text-sm text-muted-foreground">
              {doneCount}/{items.length}
              {hardCount > 0 && <span className="ml-1 text-amber-600">· {hardCount} needs work</span>}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {items.map(item => {
              const q = item.quality as Quality | null | undefined;
              const isChecked = item.completed;
              const hasQuality = !!q;
              const isHardOrRelearn = q === "hard" || q === "relearn";

              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between px-4 py-3 gap-3 transition-colors ${
                    isChecked
                      ? "bg-emerald-50/60"
                      : isHardOrRelearn
                      ? "bg-amber-50/40"
                      : "hover:bg-muted/30"
                  }`}
                  data-testid={`hw-item-${item.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                      isChecked
                        ? "border-emerald-500 bg-emerald-500"
                        : isHardOrRelearn
                        ? "border-amber-400 bg-amber-400"
                        : "border-muted-foreground/30 bg-transparent"
                    }`}>
                      {(isChecked || isHardOrRelearn) && (
                        <Check className="w-3 h-3 text-white" strokeWidth={3} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <span className={`text-sm font-medium ${isChecked ? "text-muted-foreground line-through" : ""}`}>
                        Page {item.pageNumber}
                      </span>
                      <Badge variant="outline" className="ml-2 text-xs py-0">
                        {item.type}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {QUALITIES.map(({ value, label: ql }) => {
                      const isActive = q === value;
                      const colors = qualityColors[value];
                      return (
                        <button
                          key={value}
                          onClick={() => handleQualitySelect(item.id, value, q)}
                          disabled={updateItem.isPending}
                          className={`text-xs px-2 py-1 rounded-md border font-medium transition-all ${
                            isActive
                              ? colors.active
                              : `border-border bg-background hover:border-${value === "excellent" ? "emerald" : value === "good" ? "sky" : value === "hard" ? "amber" : "rose"}-300 hover:bg-muted/60 text-muted-foreground`
                          }`}
                          data-testid={`hw-quality-btn-${item.id}-${value}`}
                        >
                          {ql}
                        </button>
                      );
                    })}
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
