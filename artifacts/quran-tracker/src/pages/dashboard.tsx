import {
  useGetProgressOverview,
  useGetRecentActivity,
  useListPageProgress,
  useGetDailyChart,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QualityBadge } from "@/components/quality-badge";
import { BookOpen, AlertTriangle, Clock, CheckCircle, Flame } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { format, parseISO } from "date-fns";

function DuePagesSection() {
  const { data: overdue, isLoading: loadingOverdue } = useListPageProgress({ status: "overdue", inScope: true });
  const { data: dueSoon, isLoading: loadingDueSoon } = useListPageProgress({ status: "due_soon", inScope: true });

  const allPages = [
    ...(overdue ?? []).map(p => ({ ...p, urgency: "overdue" as const })),
    ...(dueSoon ?? []).map(p => ({ ...p, urgency: "due_soon" as const })),
  ].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    return da - db;
  });

  const isLoading = loadingOverdue || loadingDueSoon;

  if (isLoading) {
    return <Skeleton className="h-48 rounded-xl" />;
  }

  if (allPages.length === 0) {
    return (
      <Card className="border shadow-sm" data-testid="due-pages-empty">
        <CardContent className="py-6 text-center">
          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
          <p className="text-sm font-medium">All caught up!</p>
          <p className="text-xs text-muted-foreground mt-0.5">No pages overdue or due soon.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border shadow-sm" data-testid="due-pages-section">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500" />
          Pages Requiring Attention
          <span className="ml-auto text-xs font-normal text-muted-foreground">{allPages.length} pages</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y max-h-64 overflow-y-auto">
          {allPages.map(page => {
            const isOverdue = page.urgency === "overdue";
            const dueDate = page.dueDate ? new Date(page.dueDate) : null;
            const daysLabel = page.daysUntilDue !== null
              ? isOverdue
                ? `${Math.abs(page.daysUntilDue)}d overdue`
                : `due in ${page.daysUntilDue}d`
              : null;

            return (
              <div
                key={page.pageNumber}
                className={`flex items-center justify-between px-4 py-2.5 ${isOverdue ? "bg-rose-50/50" : "bg-amber-50/30"}`}
                data-testid={`due-page-${page.pageNumber}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-1.5 h-7 rounded-full shrink-0 ${isOverdue ? "bg-rose-500" : "bg-amber-400"}`} />
                  <div className="min-w-0">
                    <span className="font-medium text-sm">Page {page.pageNumber}</span>
                    <span className="text-xs text-muted-foreground ml-2 truncate hidden sm:inline">{page.surahs.split(",")[0]}</span>
                    <div className="text-xs text-muted-foreground sm:hidden truncate">{page.surahs.split(",")[0]}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <QualityBadge quality={page.quality} />
                  {daysLabel && (
                    <span className={`text-xs font-medium ${isOverdue ? "text-rose-600" : "text-amber-600"}`}>
                      {daysLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function DailyChartSection() {
  const { data: chartData, isLoading } = useGetDailyChart({ days: 30 });

  if (isLoading) {
    return <Skeleton className="h-52 rounded-xl" />;
  }

  const hasAny = chartData?.some(d => d.pages > 0);

  const formatted = chartData?.map(d => ({
    ...d,
    label: format(parseISO(d.date), "MMM d"),
    shortLabel: format(parseISO(d.date), "d"),
  })) ?? [];

  return (
    <Card className="border shadow-sm" data-testid="daily-chart-section">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Daily Recitation</CardTitle>
          <span className="text-xs text-muted-foreground">Last 30 days</span>
        </div>
      </CardHeader>
      <CardContent className="pt-2 pb-4 px-2">
        {!hasAny ? (
          <div className="h-40 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No recitations recorded in the last 30 days.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={formatted} margin={{ top: 4, right: 8, left: -20, bottom: 0 }} barSize={8}>
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
                  const d = payload[0].payload as (typeof formatted)[0];
                  return (
                    <div className="bg-background border rounded-lg shadow-md px-3 py-2 text-sm">
                      <div className="font-medium">{d.label}</div>
                      <div className="text-muted-foreground">{d.pages} page{d.pages !== 1 ? "s" : ""}</div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="pages" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: overview, isLoading: overviewLoading } = useGetProgressOverview();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity({ limit: 10 });

  if (overviewLoading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold">Dashboard</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!overview) return null;

  const statCards = [
    { label: "In Scope", value: overview.pagesInScope, total: overview.totalPages, icon: BookOpen, color: "text-primary" },
    { label: "Overdue", value: overview.pagesOverdue, icon: AlertTriangle, color: "text-rose-500" },
    { label: "Due Soon", value: overview.pagesDueSoon, icon: Clock, color: "text-amber-500" },
    { label: "On Track", value: overview.pagesOnTrack, icon: CheckCircle, color: "text-emerald-500" },
  ];

  return (
    <div className="space-y-5" data-testid="dashboard-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-1">Your Quran memorization overview</p>
        </div>
        {overview.streakDays > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 px-4 py-2 rounded-xl" data-testid="streak-counter">
            <Flame className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-semibold text-amber-700">{overview.streakDays} day streak</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(stat => (
          <Card key={stat.label} className="border shadow-sm" data-testid={`stat-${stat.label.toLowerCase().replace(/\s/g, "-")}`}>
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-center justify-between mb-2">
                <stat.icon className={`w-5 h-5 ${stat.color}`} />
                {stat.total && (
                  <span className="text-xs text-muted-foreground">/ {stat.total}</span>
                )}
              </div>
              <div className="text-2xl font-bold">{stat.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <DuePagesSection />

      <DailyChartSection />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quality Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                { label: "Excellent", count: overview.excellentCount, color: "bg-emerald-500" },
                { label: "Good", count: overview.goodCount, color: "bg-sky-500" },
                { label: "Hard", count: overview.hardCount, color: "bg-amber-500" },
                { label: "Relearn", count: overview.relearnCount, color: "bg-rose-500" },
              ].map(item => {
                const total = overview.pagesInScope || 1;
                const pct = Math.round((item.count / total) * 100);
                return (
                  <div key={item.label} className="flex items-center gap-3" data-testid={`quality-bar-${item.label.toLowerCase()}`}>
                    <span className="text-sm w-20 text-muted-foreground">{item.label}</span>
                    <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-medium w-10 text-right">{item.count}</span>
                  </div>
                );
              })}
            </div>
            {overview.pagesInScope === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No pages in scope yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : activity && activity.length > 0 ? (
              <div className="space-y-2">
                {activity.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between py-2 border-b border-border last:border-0" data-testid={`activity-${entry.id}`}>
                    <div>
                      <span className="text-sm font-medium">Page {entry.pageNumber}</span>
                      <span className="text-xs text-muted-foreground ml-2">{entry.surahName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <QualityBadge quality={entry.quality} />
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.recitedAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No recitations yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
