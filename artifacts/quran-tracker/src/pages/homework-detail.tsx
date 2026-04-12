import { useGetHomework, useUpdateHomeworkItem, getGetHomeworkQueryKey, getListHomeworkQueryKey, getGetProgressOverviewQueryKey, getListPageProgressQueryKey } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

export default function HomeworkDetail() {
  const params = useParams<{ id: string }>();
  const homeworkId = parseInt(params.id || "0", 10);
  const { data: detail, isLoading } = useGetHomework(homeworkId, {
    query: { enabled: !!homeworkId, queryKey: getGetHomeworkQueryKey(homeworkId) },
  });
  const updateItem = useUpdateHomeworkItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleToggle = (itemId: number, completed: boolean, quality?: string) => {
    updateItem.mutate(
      {
        homeworkId,
        itemId,
        data: {
          completed,
          quality: quality as "excellent" | "good" | "hard" | "relearn" | undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetHomeworkQueryKey(homeworkId) });
          queryClient.invalidateQueries({ queryKey: getListHomeworkQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
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

  const renderItems = (items: typeof detail.items, label: string) => (
    items.length > 0 && (
      <Card className="border shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{label} ({items.filter(i => i.completed).length}/{items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {items.map(item => (
              <div
                key={item.id}
                className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                  item.completed ? "bg-emerald-50" : "hover:bg-muted/50"
                }`}
                data-testid={`hw-item-${item.id}`}
              >
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={item.completed}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        handleToggle(item.id, true, "good");
                      } else {
                        handleToggle(item.id, false);
                      }
                    }}
                    data-testid={`hw-checkbox-${item.id}`}
                  />
                  <span className={`text-sm font-medium ${item.completed ? "line-through text-muted-foreground" : ""}`}>
                    Page {item.pageNumber}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {item.type}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  {item.completed && (
                    <Select
                      value={item.quality || "good"}
                      onValueChange={(val) => handleToggle(item.id, true, val)}
                    >
                      <SelectTrigger className="w-28 h-8 text-xs" data-testid={`hw-quality-${item.id}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excellent">Excellent</SelectItem>
                        <SelectItem value="good">Good</SelectItem>
                        <SelectItem value="hard">Hard</SelectItem>
                        <SelectItem value="relearn">Relearn</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {item.completedAt && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.completedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  );

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
