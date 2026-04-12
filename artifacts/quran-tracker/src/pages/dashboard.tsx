import { useGetProgressOverview, useGetRecentActivity } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QualityBadge } from "@/components/quality-badge";
import { BookOpen, AlertTriangle, Clock, CheckCircle, Flame } from "lucide-react";

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
    <div className="space-y-6" data-testid="dashboard-page">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
              <p className="text-sm text-muted-foreground text-center py-4">No pages in scope yet. Add pages to start tracking.</p>
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
              <p className="text-sm text-muted-foreground text-center py-4">No recitations yet. Start by recording a recitation.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
