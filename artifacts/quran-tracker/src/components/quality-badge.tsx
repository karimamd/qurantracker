import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";

const qualityClassName: Record<string, string> = {
  excellent: "bg-emerald-100 text-emerald-800 border-emerald-200",
  good: "bg-sky-100 text-sky-800 border-sky-200",
  hard: "bg-amber-100 text-amber-800 border-amber-200",
  relearn: "bg-rose-100 text-rose-800 border-rose-200",
};

// Visually distinct (faded + dashed) palette for an auto-downgraded quality so it
// reads as "computed/temporary" instead of the user's recorded rating.
const downgradedClassName: Record<string, string> = {
  excellent: "bg-emerald-50 text-emerald-700 border-emerald-200 border-dashed",
  good: "bg-sky-50 text-sky-700 border-sky-200 border-dashed",
  hard: "bg-amber-50 text-amber-700 border-amber-200 border-dashed",
  relearn: "bg-rose-50 text-rose-700 border-rose-200 border-dashed",
};

const statusClassName: Record<string, string> = {
  overdue: "bg-rose-100 text-rose-800 border-rose-200",
  due_soon: "bg-amber-100 text-amber-800 border-amber-200",
  on_track: "bg-emerald-100 text-emerald-800 border-emerald-200",
  not_started: "bg-gray-100 text-gray-600 border-gray-200",
  out_of_scope: "bg-gray-50 text-gray-400 border-gray-100",
};

interface QualityBadgeProps {
  quality: string | null;
  effectiveQuality?: string | null;
  qualityDowngrades?: number;
}

export function QualityBadge({ quality, effectiveQuality, qualityDowngrades }: QualityBadgeProps) {
  const { t } = useTranslation();
  if (!quality) return <span className="text-xs text-muted-foreground">--</span>;

  const downgrades = qualityDowngrades ?? 0;
  const display = downgrades > 0 && effectiveQuality ? effectiveQuality : quality;
  const className = downgrades > 0
    ? downgradedClassName[display]
    : qualityClassName[display];
  if (!className) return null;

  const tooltip = downgrades > 0
    ? t("quality.downgradedTooltip", {
        original: t(`quality.${quality}`),
        effective: t(`quality.${display}`),
        weeks: downgrades * 2,
      })
    : undefined;

  return (
    <Badge
      variant="outline"
      className={`${className} text-xs font-medium inline-flex items-center gap-0.5`}
      data-testid={`quality-${display}`}
      data-original-quality={quality}
      data-quality-downgrades={downgrades}
      title={tooltip}
    >
      <span>{t(`quality.${display}`)}</span>
      {downgrades > 0 && (
        <span
          className="inline-flex items-center -me-0.5"
          aria-label={t("quality.downgradedAria", {
            count: downgrades,
            original: t(`quality.${quality}`),
          })}
        >
          {Array.from({ length: Math.min(downgrades, 3) }).map((_, i) => (
            <ChevronDown key={i} className="w-3 h-3 -mx-[3px]" strokeWidth={2.5} />
          ))}
        </span>
      )}
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
