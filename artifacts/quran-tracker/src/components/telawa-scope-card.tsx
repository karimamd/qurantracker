import {
  useGetTelawaScopeToday,
  useRecordTelawaScopeRead,
  useUndoTelawaScopeRead,
  useUpdateActiveScopeCycle,
  useGetSettings,
  getGetTelawaScopeTodayQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PageLabel } from "@/components/page-label";
import {
  Check,
  Undo2,
  CheckCircle,
  ExternalLink,
  Target,
  Pencil,
  Repeat2,
  BookOpen,
} from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { useState } from "react";

/**
 * "In-Scope Round-Robin" reading goal — a lightweight reading track that
 * cycles through only the user's in-scope memorization pages, separate from
 * the full-Quran Khatmah rotation. Either an explicit read here OR any
 * recitation counts toward covering a page this cycle.
 */
export function TelawaScopeCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: scope, isLoading } = useGetTelawaScopeToday();
  const { data: settings } = useGetSettings();
  const recordRead = useRecordTelawaScopeRead();
  const undoRead = useUndoTelawaScopeRead();
  const updateActive = useUpdateActiveScopeCycle();
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [goalInput, setGoalInput] = useState("");

  const defaultPagesPerDay = settings?.telawaPagesPerDay ?? 5;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetTelawaScopeTodayQueryKey() });
  };

  const handleRead = (pageNumber: number) => {
    recordRead.mutate(
      { data: { pageNumber } },
      {
        onSuccess: () => invalidate(),
        onError: () => toast({ title: t("telawa.scope.recordFailed"), variant: "destructive" }),
      },
    );
  };

  const handleUndo = () => {
    undoRead.mutate(undefined, {
      onSuccess: () => {
        invalidate();
        toast({ title: t("telawa.scope.undoSuccess") });
      },
      onError: () => toast({ title: t("telawa.scope.undoFailed"), variant: "destructive" }),
    });
  };

  const handleSaveGoal = () => {
    const trimmed = goalInput.trim();
    let payload: { pagesPerDay: number | null };
    if (trimmed === "") {
      payload = { pagesPerDay: null };
    } else {
      const g = parseInt(trimmed, 10);
      if (!Number.isFinite(g) || g < 1 || g > 604) {
        toast({ title: t("telawa.scope.invalidPagesPerDay"), variant: "destructive" });
        return;
      }
      payload = { pagesPerDay: g };
    }
    updateActive.mutate(
      { data: payload },
      {
        onSuccess: () => {
          invalidate();
          setGoalDialogOpen(false);
          toast({
            title:
              payload.pagesPerDay === null
                ? t("telawa.scope.goalCleared")
                : t("telawa.scope.goalUpdated"),
          });
        },
        onError: () =>
          toast({ title: t("telawa.scope.goalUpdateFailed"), variant: "destructive" }),
      },
    );
  };

  if (isLoading || !scope) {
    return <Skeleton className="h-56 rounded-xl" data-testid="telawa-scope-loading" />;
  }

  const allDone = scope.totalInScope > 0 && scope.readToday >= scope.pagesPerDay;
  const cyclePct =
    scope.totalInScope > 0
      ? Math.min(100, Math.round((scope.readInCycle / scope.totalInScope) * 100))
      : 0;

  return (
    <Card className="border shadow-sm" data-testid="telawa-scope-card">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Repeat2 className="w-4 h-4 text-primary" />
              {t("telawa.scope.title")}
            </CardTitle>
            <CardDescription>{t("telawa.scope.description")}</CardDescription>
          </div>
          <Dialog
            open={goalDialogOpen}
            onOpenChange={(open) => {
              setGoalDialogOpen(open);
              if (open) {
                setGoalInput(
                  scope.pagesPerDayOverride != null ? String(scope.pagesPerDayOverride) : "",
                );
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                data-testid="telawa-scope-edit-goal"
                title={t("telawa.scope.editGoal")}
              >
                <Target className="w-3.5 h-3.5" />
                <span className="tabular-nums">
                  {scope.pagesPerDayOverride != null
                    ? t("telawa.scope.pagesPerDayUsingOverride", { value: scope.pagesPerDayOverride })
                    : t("telawa.scope.pagesPerDayUsingDefault", { value: defaultPagesPerDay })}
                </span>
                <Pencil className="w-3 h-3 opacity-60" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("telawa.scope.editGoalDialogTitle")}</DialogTitle>
                <DialogDescription>
                  {t("telawa.scope.editGoalDialogDescription", { fallback: defaultPagesPerDay })}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="scope-goal-input">
                  {t("telawa.scope.pagesPerDayLabel")}
                </label>
                <Input
                  id="scope-goal-input"
                  type="number"
                  min={1}
                  max={604}
                  placeholder={String(defaultPagesPerDay)}
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  data-testid="telawa-scope-goal-input"
                />
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setGoalDialogOpen(false)}
                  data-testid="telawa-scope-goal-cancel"
                >
                  {t("telawa.scope.cancel")}
                </Button>
                <Button
                  onClick={handleSaveGoal}
                  disabled={updateActive.isPending}
                  data-testid="telawa-scope-goal-save"
                >
                  <Check className="w-4 h-4 me-1.5" />
                  {updateActive.isPending ? t("telawa.scope.saving") : t("telawa.scope.save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {scope.totalInScope === 0 ? (
          <div className="px-4 pb-4 text-sm text-muted-foreground" data-testid="telawa-scope-empty">
            {t("telawa.scope.empty")}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 px-4 pb-3">
              <div data-testid="telawa-scope-stat-today">
                <div className="text-xs text-muted-foreground">{t("telawa.scope.statToday")}</div>
                <div className="text-xl font-bold mt-0.5">
                  {scope.readToday}
                  <span className="text-sm font-normal text-muted-foreground"> / {scope.pagesPerDay}</span>
                </div>
              </div>
              <div data-testid="telawa-scope-stat-cycle">
                <div className="text-xs text-muted-foreground">{t("telawa.scope.statCycle")}</div>
                <div className="text-xl font-bold mt-0.5">{scope.cycleNumber}</div>
              </div>
              <div data-testid="telawa-scope-stat-coverage">
                <div className="text-xs text-muted-foreground">{t("telawa.scope.statCoverage")}</div>
                <div className="text-xl font-bold mt-0.5">
                  {scope.readInCycle}
                  <span className="text-sm font-normal text-muted-foreground"> / {scope.totalInScope}</span>
                </div>
              </div>
            </div>

            <div className="px-4 pb-3">
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${cyclePct}%` }}
                  data-testid="telawa-scope-cycle-bar"
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-4 pb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("telawa.scope.upcoming")}
              </span>
              {scope.recentReads.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={handleUndo}
                  disabled={undoRead.isPending}
                  data-testid="telawa-scope-undo"
                >
                  <Undo2 className="w-3.5 h-3.5 me-1" />
                  {undoRead.isPending ? t("telawa.scope.undoing") : t("telawa.scope.undoLast")}
                </Button>
              )}
            </div>

            {allDone && (
              <div
                className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800"
                data-testid="telawa-scope-done-banner"
              >
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{t("telawa.scope.allDone", { count: scope.pagesPerDay })}</span>
              </div>
            )}

            {scope.upcomingPages.length === 0 ? (
              <div
                className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800"
                data-testid="telawa-scope-cycle-complete"
              >
                <CheckCircle className="w-4 h-4 shrink-0" />
                <span>{t("telawa.scope.cycleComplete")}</span>
              </div>
            ) : (
              <ul className="divide-y border-t">
                {scope.upcomingPages.map((pageNumber, idx) => {
                  const isCursor = idx === 0;
                  return (
                    <li
                      key={`${pageNumber}-${idx}`}
                      className={`flex items-center gap-3 px-4 py-2.5 ${isCursor ? "bg-primary/5" : ""}`}
                      data-testid={`telawa-scope-upcoming-${pageNumber}`}
                    >
                      <div
                        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                          isCursor ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {idx + 1}
                      </div>
                      <Link
                        href={`/reader/${pageNumber}`}
                        className="flex-1 min-w-0 hover:underline"
                        data-testid={`telawa-scope-open-reader-${pageNumber}`}
                        title={t("telawa.openInReader")}
                      >
                        <PageLabel
                          pageNumber={pageNumber}
                          customName={null}
                          prefixClassName="font-medium text-sm"
                          nameClassName="text-sm"
                        />
                      </Link>
                      <Link href={`/reader/${pageNumber}`}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground"
                          title={t("telawa.openInReader")}
                          data-testid={`telawa-scope-open-reader-btn-${pageNumber}`}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant={isCursor ? "default" : "outline"}
                        disabled={recordRead.isPending}
                        onClick={() => handleRead(pageNumber)}
                        data-testid={`telawa-scope-read-${pageNumber}`}
                      >
                        <Check className="w-4 h-4 me-1.5" />
                        {t("telawa.read")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}

            {scope.recentReads.length > 0 && (
              <div className="border-t bg-muted/30 px-4 py-3">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5" />
                  {t("telawa.scope.readToday")}
                </div>
                <ul className="space-y-1.5">
                  {scope.recentReads.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center gap-2 text-sm"
                      data-testid={`telawa-scope-read-entry-${entry.id}`}
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                      <PageLabel
                        pageNumber={entry.pageNumber}
                        customName={null}
                        prefixClassName="font-medium"
                        nameClassName="text-muted-foreground"
                      />
                      <span className="ms-auto text-xs text-muted-foreground">
                        {format(new Date(entry.readAt), "HH:mm")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
