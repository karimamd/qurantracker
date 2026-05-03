import {
  useGetTelawaToday,
  useRecordTelawaRead,
  useUndoTelawaRead,
  useGetTelawaStats,
  getGetTelawaTodayQueryKey,
  getGetTelawaStatsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageLabel } from "@/components/page-label";
import { BookOpen, Check, Undo2, RotateCcw, CheckCircle, Repeat } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
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
  const recordRead = useRecordTelawaRead();
  const undoRead = useUndoTelawaRead();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetTelawaTodayQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTelawaStatsQueryKey() });
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Repeat className="w-6 h-6 text-primary" />
            {t("telawa.title")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t("telawa.subtitle")}</p>
        </div>
      </div>

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
                  <div className="flex-1 min-w-0">
                    <PageLabel
                      pageNumber={pageNumber}
                      customName={null}
                      prefixClassName="font-medium text-sm"
                      nameClassName="text-sm"
                    />
                  </div>
                  <Button
                    size="sm"
                    variant={isCursor ? "default" : "outline"}
                    disabled={!isCursor || recordRead.isPending}
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
