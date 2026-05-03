import { useListHomework, useCreateHomework, useDeleteHomework, getListHomeworkQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ChevronRight } from "lucide-react";
import { HomeworkRangePickers } from "@/components/homework-range-pickers";
import { parsePageRange, appendPageRange } from "@/lib/homework-pages";
import { useTranslation } from "react-i18next";

export default function HomeworkList() {
  const { t } = useTranslation();
  const { data: sessions, isLoading } = useListHomework();
  const createHomework = useCreateHomework();
  const deleteHomework = useDeleteHomework();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [memorizeRange, setMemorizeRange] = useState("");
  const [reviseRange, setReviseRange] = useState("");

  const handleCreate = () => {
    if (!title || !dueDate) {
      toast({ title: t("homework.requiredFields"), variant: "destructive" });
      return;
    }

    createHomework.mutate(
      {
        data: {
          title,
          dueDate: new Date(dueDate).toISOString(),
          memorizePages: parsePageRange(memorizeRange),
          revisePages: parsePageRange(reviseRange),
        },
      },
      {
        onSuccess: () => {
          toast({ title: t("homework.created") });
          setDialogOpen(false);
          setTitle("");
          setDueDate("");
          setMemorizeRange("");
          setReviseRange("");
          queryClient.invalidateQueries({ queryKey: getListHomeworkQueryKey() });
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteHomework.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: t("homework.deleted") });
          queryClient.invalidateQueries({ queryKey: getListHomeworkQueryKey() });
        },
      }
    );
  };

  const statusColors: Record<string, string> = {
    active: "bg-teal-100 text-teal-800 border-teal-200",
    completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
    overdue: "bg-rose-100 text-rose-800 border-rose-200",
  };
  const statusLabels: Record<string, string> = {
    active: t("status.active"),
    completed: t("status.completed"),
    overdue: t("status.overdue"),
  };

  return (
    <div className="space-y-4" data-testid="homework-list-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{t("homework.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t("homework.subtitle")}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="btn-create-homework">
              <Plus className="w-4 h-4 me-1" /> {t("homework.newSession")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("homework.createSession")}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>{t("homework.form.title")}</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("homework.form.titlePlaceholder")} data-testid="input-hw-title" />
              </div>
              <div>
                <Label>{t("homework.form.dueDate")}</Label>
                <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} data-testid="input-hw-due" />
              </div>
              <div>
                <Label>{t("homework.form.memorize")}</Label>
                <Input value={memorizeRange} onChange={e => setMemorizeRange(e.target.value)} placeholder={t("homework.form.memorizePlaceholder")} data-testid="input-hw-memorize" />
                <HomeworkRangePickers
                  testIdPrefix="memorize"
                  onPick={(start, end) => setMemorizeRange(appendPageRange(memorizeRange, start, end))}
                />
                <p className="text-xs text-muted-foreground mt-1">{t("homework.form.rangeHint")}</p>
              </div>
              <div>
                <Label>{t("homework.form.revise")}</Label>
                <Input value={reviseRange} onChange={e => setReviseRange(e.target.value)} placeholder={t("homework.form.revisePlaceholder")} data-testid="input-hw-revise" />
                <HomeworkRangePickers
                  testIdPrefix="revise"
                  onPick={(start, end) => setReviseRange(appendPageRange(reviseRange, start, end))}
                />
              </div>
              <Button onClick={handleCreate} disabled={createHomework.isPending} className="w-full" data-testid="btn-submit-homework">
                {createHomework.isPending ? t("common.creating") : t("homework.form.submit")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : sessions && sessions.length > 0 ? (
        <div className="space-y-3">
          {sessions.map(session => {
            const pct = session.totalItems > 0 ? Math.round((session.completedItems / session.totalItems) * 100) : 0;
            return (
              <Card key={session.id} className="border shadow-sm" data-testid={`homework-card-${session.id}`}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <Link href={`/homework/${session.id}`} className="font-medium text-sm hover:underline cursor-pointer">
                        {session.title}
                      </Link>
                      <Badge variant="outline" className={statusColors[session.status] || ""}>
                        {statusLabels[session.status] ?? session.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {t("common.due")}: {new Date(session.dueDate).toLocaleDateString()}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(session.id)} data-testid={`btn-delete-hw-${session.id}`}>
                        <Trash2 className="w-3 h-3 text-muted-foreground" />
                      </Button>
                      <Link href={`/homework/${session.id}`}>
                        <Button variant="ghost" size="sm">
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress value={pct} className="flex-1 h-2" />
                    <span
                      className="text-xs text-muted-foreground whitespace-nowrap"
                      title={t("homework.pagesProgressTitle")}
                      data-testid={`hw-session-pages-progress-${session.id}`}
                    >
                      {t("homework.pagesProgress", { done: session.completedItems, total: session.totalItems })}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border shadow-sm">
          <CardContent className="py-8 text-center">
            <p className="text-sm text-muted-foreground">{t("homework.noSessions")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Note: the RangePickers UI moved to `@/components/homework-range-pickers`
// so the Edit homework dialog on the detail page can reuse it. The parse /
