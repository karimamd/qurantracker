import {
  useGetTelawaToday,
  useRecordTelawaRead,
  useUndoTelawaRead,
  useGetTelawaStats,
  useStartKhatmah,
  useUpdateActiveKhatmah,
  useGetSettings,
  getGetTelawaTodayQueryKey,
  getGetTelawaStatsQueryKey,
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
import { TelawaScopeCard } from "@/components/telawa-scope-card";
import { TelawaHomeworkReadingCard } from "@/components/telawa-homework-reading-card";
import { BookOpen, Check, Undo2, RotateCcw, CheckCircle, Repeat, ExternalLink, Sparkles, Target, Pencil } from "lucide-react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export default function TelawaPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: today, isLoading } = useGetTelawaToday();
  const { data: stats } = useGetTelawaStats();
  const { data: settings } = useGetSettings();
  const recordRead = useRecordTelawaRead();
  const undoRead = useUndoTelawaRead();
  const startKhatmah = useStartKhatmah();
  const updateActiveKhatmah = useUpdateActiveKhatmah();
  const [khatmahDialogOpen, setKhatmahDialogOpen] = useState(false);
  const [khatmahStartPage, setKhatmahStartPage] = useState<string>("1");
  const [khatmahPagesPerDay, setKhatmahPagesPerDay] = useState<string>("");
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [goalInput, setGoalInput] = useState<string>("");

  // Default daily goal — used in fallback labels and as a placeholder when the
  // active Khatmah doesn't have its own override.
  const defaultPagesPerDay = settings?.telawaPagesPerDay ?? 5;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetTelawaTodayQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTelawaStatsQueryKey() });
  };

  const handleStartKhatmah = () => {
    const n = parseInt(khatmahStartPage, 10);
    if (!Number.isFinite(n) || n < 1 || n > 604) {
      toast({ title: t("telawa.khatmah.invalidPage"), variant: "destructive" });
      return;
    }
    // pagesPerDay is optional. Empty input → omit the field so the server
    // leaves the column NULL (= inherit from settings).
    const trimmedGoal = khatmahPagesPerDay.trim();
    let pagesPerDay: number | undefined;
    if (trimmedGoal !== "") {
      const g = parseInt(trimmedGoal, 10);
      if (!Number.isFinite(g) || g < 1 || g > 604) {
        toast({ title: t("telawa.khatmah.invalidPagesPerDay"), variant: "destructive" });
        return;
      }
      pagesPerDay = g;
    }
    startKhatmah.mutate(
      { data: { startPage: n, ...(pagesPerDay !== undefined ? { pagesPerDay } : {}) } },
      {
        onSuccess: () => {
          invalidate();
          setKhatmahDialogOpen(false);
          toast({ title: t("telawa.khatmah.started", { page: n }) });
        },
        onError: () =>
          toast({ title: t("telawa.khatmah.startFailed"), variant: "destructive" }),
      },
    );
  };

  const handleSaveGoal = () => {
    const trimmed = goalInput.trim();
    // Empty input clears the per-Khatmah override (server-side: column → NULL).
    let payload: { pagesPerDay: number | null };
    if (trimmed === "") {
      payload = { pagesPerDay: null };
    } else {
      const g = parseInt(trimmed, 10);
      if (!Number.isFinite(g) || g < 1 || g > 604) {
        toast({ title: t("telawa.khatmah.invalidPagesPerDay"), variant: "destructive" });
        return;
      }
      payload = { pagesPerDay: g };
    }
    updateActiveKhatmah.mutate(
      { data: payload },
      {
        onSuccess: () => {
          invalidate();
          setGoalDialogOpen(false);
          toast({
            title: payload.pagesPerDay === null
              ? t("telawa.khatmah.goalCleared")
              : t("telawa.khatmah.goalUpdated"),
          });
        },
        onError: () =>
          toast({ title: t("telawa.khatmah.goalUpdateFailed"), variant: "destructive" }),
      },
    );
  };

  const handleRead = (pageNumber: number) => {
    recordRead.mutate(
      { data: { pageNumber } },
      {
        onSuccess: () => invalidate(),
        onError: () => toast({ title: t("telawa.recordFailed"), variant: "destructive" }),
      },
    );
  };

  const handleUndo = () => {
    undoRead.mutate(undefined, {
      onSuccess: () => {
        invalidate();
        toast({ title: t("telawa.undoSuccess") });
      },
      onError: () => toast({ title: t("telawa.undoFailed"), variant: "destructive" }),
    });
  };

  if (isLoading || !today) {
    return (
      <div className="space-y-4 max-w-3xl" data-testid="telawa-loading">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  const upcoming = today.upcomingPages;
  const allDone = today.readToday >= today.pagesPerDay;

  // Daily target progress: pagesReadToday / pagesPerDay
  const targetPct = Math.min(100, Math.round((today.readToday / Math.max(1, today.pagesPerDay)) * 100));

  const last30 = stats?.last30Days?.map((d) => ({
    ...d,
    label: format(parseISO(d.date), "MMM d"),
    shortLabel: format(parseISO(d.date), "d"),
  })) ?? [];

  return (
    <div className="space-y-5 max-w-3xl" data-testid="telawa-page">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Repeat className="w-6 h-6 text-primary" />
            {t("telawa.title")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t("telawa.subtitle")}</p>
        </div>
        <Dialog
          open={khatmahDialogOpen}
          onOpenChange={(open) => {
            setKhatmahDialogOpen(open);
            if (open) {
              setKhatmahStartPage(String(today.khatmah.startPage));
              // Pre-fill with the current Khatmah's override (if any) so the
              // user sees their previous choice; blank means "use default".
              setKhatmahPagesPerDay(
                today.khatmah.pagesPerDay != null
                  ? String(today.khatmah.pagesPerDay)
                  : "",
              );
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="border-primary/40 text-primary hover:bg-primary/10"
              data-testid="telawa-start-khatmah"
            >
              <Sparkles className="w-4 h-4 me-1.5" />
              {t("telawa.khatmah.startNew")}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("telawa.khatmah.dialogTitle")}</DialogTitle>
              <DialogDescription>{t("telawa.khatmah.dialogDescription")}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="khatmah-start-page">
                {t("telawa.khatmah.startPageLabel")}
              </label>
              <Input
                id="khatmah-start-page"
                type="number"
                min={1}
                max={604}
                value={khatmahStartPage}
                onChange={(e) => setKhatmahStartPage(e.target.value)}
                data-testid="telawa-khatmah-page-input"
              />
              <p className="text-xs text-muted-foreground">
                {t("telawa.khatmah.startPageHint")}
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="khatmah-pages-per-day">
                {t("telawa.khatmah.pagesPerDayLabel")}
              </label>
              <Input
                id="khatmah-pages-per-day"
                type="number"
                min={1}
                max={604}
                placeholder={String(defaultPagesPerDay)}
                value={khatmahPagesPerDay}
                onChange={(e) => setKhatmahPagesPerDay(e.target.value)}
                data-testid="telawa-khatmah-ppd-input"
              />
              <p className="text-xs text-muted-foreground">
                {t("telawa.khatmah.pagesPerDayHint", { fallback: defaultPagesPerDay })}
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setKhatmahDialogOpen(false)}
                data-testid="telawa-khatmah-cancel"
              >
                {t("telawa.khatmah.cancel")}
              </Button>
              <Button
                onClick={handleStartKhatmah}
                disabled={startKhatmah.isPending}
                data-testid="telawa-khatmah-confirm"
              >
                <Sparkles className="w-4 h-4 me-1.5" />
                {startKhatmah.isPending
                  ? t("telawa.khatmah.starting")
                  : t("telawa.khatmah.confirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border shadow-sm" data-testid="telawa-khatmah-banner">
        <CardContent className="py-3 px-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="w-4 h-4 text-primary shrink-0" />
            <span className="font-medium">
              {t("telawa.khatmah.bannerTitle", {
                cycle: today.khatmah.cycleNumber,
                start: today.khatmah.startPage,
              })}
            </span>
          </div>
          {(() => {
            // Visualize the 1..604 page rotation linearly. Pages before
            // `startPage` that haven't been read yet are "skipped" — shown
            // in a distinct (amber) tint so the bar makes the cursor
            // position obvious instead of always starting at the left.
            const TOTAL = 604;
            const startIdx = Math.max(0, Math.min(TOTAL - 1, today.khatmah.startPage - 1));
            const reads = Math.max(0, Math.min(TOTAL, today.khatmah.readsInKhatmah));
            const linearCapacity = TOTAL - startIdx;        // pages from startPage..604
            const preWrap = Math.min(reads, linearCapacity); // read in natural order
            const wrapped = Math.max(0, reads - linearCapacity); // read after wrapping past 604
            const stillSkipped = Math.max(0, startIdx - wrapped); // skipped pages not yet read
            const remaining = Math.max(0, TOTAL - startIdx - preWrap); // pages after the cursor
            const pct = (n: number) => (n / TOTAL) * 100;
            // The numeric label includes the visually-skipped portion so the
            // counter "starts from where the Khatmah began" instead of 0/604.
            const cursorPosition = stillSkipped + wrapped + preWrap; // 0..604
            return (
              <div className="flex-1 min-w-[140px] flex items-center gap-2">
                <div
                  className="h-1.5 bg-muted rounded-full flex-1 overflow-hidden flex"
                  title={t("telawa.khatmah.progressTooltip", {
                    read: reads,
                    skipped: stillSkipped,
                    start: today.khatmah.startPage,
                  })}
                >
                  <div className="h-full bg-primary transition-all" style={{ width: `${pct(wrapped)}%` }} />
                  <div
                    className="h-full bg-amber-300/70 dark:bg-amber-400/40 transition-all"
                    style={{ width: `${pct(stillSkipped)}%` }}
                  />
                  <div className="h-full bg-primary transition-all" style={{ width: `${pct(preWrap)}%` }} />
                  <div className="h-full" style={{ width: `${pct(remaining)}%` }} />
                </div>
                <span
                  className="text-xs tabular-nums text-muted-foreground"
                  data-testid="telawa-khatmah-progress"
                >
                  {cursorPosition} / {TOTAL}
                </span>
              </div>
            );
          })()}
          <Dialog
            open={goalDialogOpen}
            onOpenChange={(open) => {
              setGoalDialogOpen(open);
              if (open) {
                setGoalInput(
                  today.khatmah.pagesPerDay != null
                    ? String(today.khatmah.pagesPerDay)
                    : "",
                );
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                data-testid="telawa-khatmah-edit-goal"
                title={t("telawa.khatmah.editGoal")}
              >
                <Target className="w-3.5 h-3.5" />
                <span className="tabular-nums">
                  {today.khatmah.pagesPerDay != null
                    ? t("telawa.khatmah.pagesPerDayUsingOverride", {
                        value: today.khatmah.pagesPerDay,
                      })
                    : t("telawa.khatmah.pagesPerDayUsingDefault", {
                        value: defaultPagesPerDay,
                      })}
                </span>
                <Pencil className="w-3 h-3 opacity-60" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t("telawa.khatmah.editGoalDialogTitle")}</DialogTitle>
                <DialogDescription>
                  {t("telawa.khatmah.editGoalDialogDescription", {
                    fallback: defaultPagesPerDay,
                  })}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="khatmah-goal-input">
                  {t("telawa.khatmah.pagesPerDayLabel")}
                </label>
                <Input
                  id="khatmah-goal-input"
                  type="number"
                  min={1}
                  max={604}
                  placeholder={String(defaultPagesPerDay)}
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value)}
                  data-testid="telawa-khatmah-goal-input"
                />
                <p className="text-xs text-muted-foreground">
                  {t("telawa.khatmah.pagesPerDayHint", { fallback: defaultPagesPerDay })}
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="ghost"
                  onClick={() => setGoalDialogOpen(false)}
                  data-testid="telawa-khatmah-goal-cancel"
                >
                  {t("telawa.khatmah.cancel")}
                </Button>
                <Button
                  onClick={handleSaveGoal}
                  disabled={updateActiveKhatmah.isPending}
                  data-testid="telawa-khatmah-goal-save"
                >
                  <Check className="w-4 h-4 me-1.5" />
                  {updateActiveKhatmah.isPending
                    ? t("telawa.khatmah.saving")
                    : t("telawa.khatmah.save")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border shadow-sm" data-testid="telawa-stat-today">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="text-xs text-muted-foreground">{t("telawa.stats.today")}</div>
            <div className="text-2xl font-bold mt-1">
              {today.readToday}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {today.pagesPerDay}
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${targetPct}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm" data-testid="telawa-stat-cycle">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="text-xs text-muted-foreground">{t("telawa.stats.cycle")}</div>
            <div className="text-2xl font-bold mt-1">{today.cycleNumber}</div>
            <div className="text-xs text-muted-foreground mt-2">
              {t("telawa.stats.cycleDesc")}
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm" data-testid="telawa-stat-next">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="text-xs text-muted-foreground">{t("telawa.stats.nextPage")}</div>
            <div className="text-2xl font-bold mt-1">{today.nextPage}</div>
            <div className="text-xs text-muted-foreground mt-2">
              {t("telawa.stats.ofTotal", { total: 604 })}
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm" data-testid="telawa-stat-total">
          <CardContent className="pt-4 pb-4 px-4">
            <div className="text-xs text-muted-foreground">{t("telawa.stats.totalRead")}</div>
            <div className="text-2xl font-bold mt-1">{today.totalRead}</div>
            <div className="text-xs text-muted-foreground mt-2">
              {t("telawa.stats.totalDesc")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border shadow-sm" data-testid="telawa-today-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-primary" />
                {t("telawa.todayPlan.title")}
              </CardTitle>
              <CardDescription>{t("telawa.todayPlan.description")}</CardDescription>
            </div>
            {today.recentReads.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleUndo}
                disabled={undoRead.isPending}
                data-testid="telawa-undo-button"
              >
                <Undo2 className="w-4 h-4 me-1.5" />
                {undoRead.isPending ? t("telawa.undoing") : t("telawa.undoLast")}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {allDone && (
            <div
              className="mx-4 mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800"
              data-testid="telawa-done-banner"
            >
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{t("telawa.todayPlan.allDone", { count: today.pagesPerDay })}</span>
            </div>
          )}
          <ul className="divide-y">
            {upcoming.map((pageNumber, idx) => {
              const isCursor = idx === 0;
              return (
                <li
                  key={`${pageNumber}-${idx}`}
                  className={`flex items-center gap-3 px-4 py-3 ${isCursor ? "bg-primary/5" : ""}`}
                  data-testid={`telawa-upcoming-${pageNumber}`}
                >
                  <div
                    className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
                      isCursor
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {idx + 1}
                  </div>
                  <Link
                    href={`/reader/${pageNumber}`}
                    className="flex-1 min-w-0 hover:underline"
                    data-testid={`telawa-open-reader-${pageNumber}`}
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
                      data-testid={`telawa-open-reader-btn-${pageNumber}`}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </Link>
                  <Button
                    size="sm"
                    variant={isCursor ? "default" : "outline"}
                    disabled={recordRead.isPending}
                    onClick={() => handleRead(pageNumber)}
                    data-testid={`telawa-read-${pageNumber}`}
                  >
                    <Check className="w-4 h-4 me-1.5" />
                    {t("telawa.read")}
                  </Button>
                </li>
              );
            })}
          </ul>

          {today.recentReads.length > 0 && (
            <div className="border-t bg-muted/30 px-4 py-3">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {t("telawa.todayPlan.readToday")}
              </div>
              <ul className="space-y-1.5">
                {today.recentReads.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-center gap-2 text-sm"
                    data-testid={`telawa-read-entry-${entry.id}`}
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
        </CardContent>
      </Card>

      <TelawaScopeCard />

      <TelawaHomeworkReadingCard />

      <Card className="border shadow-sm" data-testid="telawa-30day-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t("telawa.last30.title")}</CardTitle>
            <span className="text-xs text-muted-foreground">{t("telawa.last30.subtitle")}</span>
          </div>
        </CardHeader>
        <CardContent className="pt-2 pb-4 px-2">
          {!last30.some((d) => d.count > 0) ? (
            <div className="h-32 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">{t("telawa.last30.empty")}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={last30} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={8}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="shortLabel"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload as (typeof last30)[0];
                    return (
                      <div className="bg-background border rounded-lg shadow-md px-3 py-2 text-sm">
                        <div className="font-medium">{d.label}</div>
                        <div className="text-muted-foreground">
                          {t("telawa.last30.tooltip", { count: d.count })}
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-dashed border-2 shadow-none bg-muted/30">
        <CardContent className="py-3 px-4 flex items-start gap-3 text-xs text-muted-foreground">
          <RotateCcw className="w-4 h-4 mt-0.5 text-muted-foreground/70 shrink-0" />
          <span>{t("telawa.note")}</span>
        </CardContent>
      </Card>
    </div>
  );
}
