import { Badge } from "@/components/ui/badge";

const qualityConfig: Record<string, { label: string; className: string }> = {
  excellent: { label: "Excellent", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  good: { label: "Good", className: "bg-sky-100 text-sky-800 border-sky-200" },
  hard: { label: "Hard", className: "bg-amber-100 text-amber-800 border-amber-200" },
  relearn: { label: "Relearn", className: "bg-rose-100 text-rose-800 border-rose-200" },
};

const statusConfig: Record<string, { label: string; className: string }> = {
  overdue: { label: "Overdue", className: "bg-rose-100 text-rose-800 border-rose-200" },
  due_soon: { label: "Due Soon", className: "bg-amber-100 text-amber-800 border-amber-200" },
  on_track: { label: "On Track", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  not_started: { label: "Not Started", className: "bg-gray-100 text-gray-600 border-gray-200" },
  out_of_scope: { label: "Not in Scope", className: "bg-gray-50 text-gray-400 border-gray-100" },
};

export function QualityBadge({ quality }: { quality: string | null }) {
  if (!quality) return <span className="text-xs text-muted-foreground">--</span>;
  const config = qualityConfig[quality];
  if (!config) return null;
  return (
    <Badge variant="outline" className={`${config.className} text-xs font-medium`} data-testid={`quality-${quality}`}>
      {config.label}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status];
  if (!config) return null;
  return (
    <Badge variant="outline" className={`${config.className} text-xs font-medium`} data-testid={`status-${status}`}>
      {config.label}
    </Badge>
  );
}

export function getQualityColor(quality: string | null): string {
  switch (quality) {
    case "excellent": return "bg-emerald-500";
    case "good": return "bg-sky-500";
    case "hard": return "bg-amber-500";
    case "relearn": return "bg-rose-500";
    default: return "bg-gray-200";
  }
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "overdue": return "bg-rose-500";
    case "due_soon": return "bg-amber-500";
    case "on_track": return "bg-emerald-500";
    case "not_started": return "bg-gray-300";
    default: return "bg-gray-200";
  }
}
