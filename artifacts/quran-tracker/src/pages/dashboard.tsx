import {
  useGetProgressOverview,
  useGetRecentActivity,
  useListPageProgress,
  useGetDailyChart,
  useGetProgressChart,
  useListHomework,
  useUpdatePageProgress,
  getListPageProgressQueryKey,
  getGetProgressOverviewQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QualityBadge } from "@/components/quality-badge";
import { Progress } from "@/components/ui/progress";
import { BookOpen, AlertTriangle, Clock, CheckCircle, Flame, ChevronRight } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { PageLabel } from "@/components/page-label";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type Quality = "excellent" | "good" | "hard" | "relearn";

const QUALITIES: { value: Quality; label: string }[] = [
  { value: "excellent", label: "Excellent" },
  { value: "good",      label: "Good" },
  { value: "hard",      label: "Hard" },
  { value: "relearn",   label: "Relearn" },
];

const qualityStyle: Record<Quality, { active: string; hover: string }> = {
  excellent: { active: "bg-emerald-500 border-emerald-500 text-white", hover: "hover:border-emerald-300 hover:text-emerald-700" },
  good:      { active: "bg-sky-500 border-sky-500 text-white",         hover: "hover:border-sky-300 hover:text-sky-700" },
  hard:      { active: "bg-amber-500 border-amber-500 text-white",     hover: "hover:border-amber-300 hover:text-amber-700" },
  relearn:   { active: "bg-rose-500 border-rose-500 text-white",       hover: "hover:border-rose-300 hover:text-rose-700" },
};

function ActiveHomeworkSection() {
  const { data: sessions, isLoading } = useListHomework();

  if (isLoading) {
    return <Skeleton className="h-20 rounded-xl" />;
  }

  const active = sessions?.find(s => s.status === "active");
  if (!active) return null;

  const pct = active.totalItems > 0 ? Math.round((active.completedItems / active.totalItems) * 100) : 0;
  const remaining = active.totalItems - active.completedItems;

  return (
    <Link href={`/homework/${active.id}`}>
      <Card
        className="border shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
        data-testid="active-homework-card"
      >
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between mb-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary uppercase tracking-wide mb-0.5">Active Homework</p>
              <p className="font-semibold text-sm truncate">{active.title}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Due {new Date(active.dueDate).toLocaleDateString()}</p>
                <p className="text-xs font-medium">{remaining > 0 ? `${remaining} left` : "All done!"}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>
          <Progress value={pct} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1.5">{active.completedItems}/{active.totalItems} pages completed</p>
        </CardContent>
      </Card>
    </Link>
  );
}

function DuePagesSection() {
  const { data: overdue, isLoading: loadingOverdue } = useListPageProgress({ status: "overdue", inScope: true });
  const { data: dueSoon, isLoading: loadingDueSoon } = useListPageProgress({ status: "due_soon", inScope: true });
  const updatePage = useUpdatePageProgress();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const allPages = [
    ...(overdue ?? []).map(p => ({ ...p, urgency: "overdue" as const })),
    ...(dueSoon ?? []).map(p => ({ ...p, urgency: "due_soon" as const })),
  ].sort((a, b) => {
    const da = a.dueDate ? new Date(a.dueDate).getTime() : 0;
    const db = b.dueDate ? new Date(b.dueDate).getTime() : 0;
    return da - db;
  });

  const isLoading = loadingOverdue || loadingDueSoon;

  const handleQuality = (pageNumber: number, quality: Quality) => {
    updatePage.mutate(
      { pageNumber, data: { quality } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() });
        },
        onError: () => toast({ title: "Failed to record recitation", variant: "destructive" }),
      }
    );
  };

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
        <div className="divide-y max-h-[28rem] overflow-y-auto">
          {allPages.map(page => {
            const isOverdue = page.urgency === "overdue";
            const daysLabel = page.daysUntilDue !== null
              ? isOverdue
                ? `${Math.abs(page.daysUntilDue)}d overdue`
                : `due in ${page.daysUntilDue}d`
              : null;
            const q = page.quality as Quality | null;

            return (
              <div
                key={page.pageNumber}
                className={`px-4 py-3 ${isOverdue ? "bg-rose-50/50" : "bg-amber-50/30"}`}
                data-testid={`due-page-${page.pageNumber}`}
              >
                <div className="flex items-center gap-3 min-w-0 mb-2">
                  <div className={`w-1.5 h-7 rounded-full shrink-0 ${isOverdue ? "bg-rose-500" : "bg-amber-400"}`} />
                  <div className="min-w-0 flex-1">
                    <PageLabel
                      pageNumber={page.pageNumber}
                      customName={page.customName}
                      prefixClassName="font-medium text-sm"
                      nameClassName="text-sm"
                    />
                    <div className="text-xs text-muted-foreground truncate">{page.surahs.split(",")[0]}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <QualityBadge quality={page.quality} />
                    {daysLabel && (
                      <span className={`text-xs font-medium ${isOverdue ? "text-rose-600" : "text-amber-600"}`}>
                        {daysLabel}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 pl-4">
                  {QUALITIES.map(({ value, label }) => {
                    const isActive = q === value;
                    const style = qualityStyle[value];
                    return (
                      <button
                        key={value}
                        onClick={() => handleQuality(page.pageNumber, value)}
                        disabled={updatePage.isPending}
                        className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-all ${
                          isActive ? style.active : `border-border bg-background text-muted-foreground ${style.hover}`
                        }`}
                        data-testid={`due-page-quality-${page.pageNumber}-${value}`}
                      >
                        {label}
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

function ProgressChartSection() {
  const { data: chartData, isLoading } = useGetProgressChart({ days: 30 });

  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl" />;
  }

  const formatted = chartData?.map(d => ({
    ...d,
    label: format(parseISO(d.date), "MMM d"),
    shortLabel: format(parseISO(d.date), "d"),
  })) ?? [];

  const hasAny = formatted.some(d => d.overdueCount > 0 || d.dailyRecitedCount > 0);

  return (
    <Card className="border shadow-sm" data-testid="progress-chart-section">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Progress Over Time</CardTitle>
          <span className="text-xs text-muted-foreground">Last 30 days</span>
        </div>
      </CardHeader>
      <CardContent className="pt-2 pb-4 px-2">
        {!hasAny ? (
          <div className="h-44 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No progress data yet.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={formatted} margin={{ top: 8, right: 16, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis
                dataKey="shortLabel"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval={4}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10, fill: "#f43f5e" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={32}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: "hsl(var(--primary))" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={32}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload as (typeof formatted)[0];
                  return (
                    <div className="bg-background border rounded-lg shadow-md px-3 py-2 text-xs space-y-0.5">
                      <div className="font-medium text-sm mb-1">{d.label}</div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        <span className="text-muted-foreground">Overdue:</span>
                        <span className="font-medium">{d.overdueCount}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-primary" />
                        <span className="text-muted-foreground">Recited that day:</span>
                        <span className="font-medium">{d.dailyRecitedCount}</span>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                iconType="circle"
                iconSize={8}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="overdueCount"
                name="Overdue pages"
                stroke="#f43f5e"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="dailyRecitedCount"
                name="Pages recited that day"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
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

      <ActiveHomeworkSection />

      <DuePagesSection />

      <ProgressChartSection />

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
                      <PageLabel
                        pageNumber={entry.pageNumber}
                        customName={null}
                        showEdit={false}
                        prefixClassName="text-sm font-medium"
                        nameClassName="text-sm"
                      />
                      <div className="text-xs text-muted-foreground">{entry.surahName}</div>
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
