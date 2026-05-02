import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

const qualityClassName: Record<string, string> = {
  excellent: "bg-emerald-100 text-emerald-800 border-emerald-200",
  good: "bg-sky-100 text-sky-800 border-sky-200",
  hard: "bg-amber-100 text-amber-800 border-amber-200",
  relearn: "bg-rose-100 text-rose-800 border-rose-200",
};

const statusClassName: Record<string, string> = {
  overdue: "bg-rose-100 text-rose-800 border-rose-200",
  due_soon: "bg-amber-100 text-amber-800 border-amber-200",
  on_track: "bg-emerald-100 text-emerald-800 border-emerald-200",
  not_started: "bg-gray-100 text-gray-600 border-gray-200",
  out_of_scope: "bg-gray-50 text-gray-400 border-gray-100",
};

export function QualityBadge({ quality }: { quality: string | null }) {
  const { t } = useTranslation();
  if (!quality) return <span className="text-xs text-muted-foreground">--</span>;
  const className = qualityClassName[quality];
  if (!className) return null;
  return (
    <Badge variant="outline" className={`${className} text-xs font-medium`} data-testid={`quality-${quality}`}>
      {t(`quality.${quality}`)}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const className = statusClassName[status];
  if (!className) return null;
  return (
    <Badge variant="outline" className={`${className} text-xs font-medium`} data-testid={`status-${status}`}>
      {t(`status.${status}`)}
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
