import { useUpdatePageProgress } from "@workspace/api-client-react";
import type { QueryKey } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

type Quality = "excellent" | "good" | "hard" | "relearn";

const QUALITIES: { value: Quality; label: string; short: string }[] = [
  { value: "excellent", label: "Excellent", short: "Exc" },
  { value: "good", label: "Good", short: "Good" },
  { value: "hard", label: "Hard", short: "Hard" },
  { value: "relearn", label: "Relearn", short: "Re" },
];

const qualityStyle: Record<Quality, { active: string; hover: string }> = {
  excellent: { active: "bg-emerald-500 border-emerald-500 text-white", hover: "hover:border-emerald-300 hover:text-emerald-700" },
  good: { active: "bg-sky-500 border-sky-500 text-white", hover: "hover:border-sky-300 hover:text-sky-700" },
  hard: { active: "bg-amber-500 border-amber-500 text-white", hover: "hover:border-amber-300 hover:text-amber-700" },
  relearn: { active: "bg-rose-500 border-rose-500 text-white", hover: "hover:border-rose-300 hover:text-rose-700" },
};

interface PageQualityButtonsProps {
  pageNumber: number;
  currentQuality: string | null;
  size?: "sm" | "xs";
  compact?: boolean;
  invalidateKeys?: QueryKey[];
  onSuccess?: () => void;
  className?: string;
}

export function PageQualityButtons({
  pageNumber,
  currentQuality,
  size = "sm",
  compact = false,
  invalidateKeys = [],
  onSuccess,
  className = "",
}: PageQualityButtonsProps) {
  const updatePage = useUpdatePageProgress();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleClick = (e: React.MouseEvent, quality: Quality) => {
    e.stopPropagation();
    e.preventDefault();
    updatePage.mutate(
      { pageNumber, data: { quality } },
      {
        onSuccess: () => {
          for (const key of invalidateKeys) {
            queryClient.invalidateQueries({ queryKey: key });
          }
          onSuccess?.();
        },
        onError: () => toast({ title: "Failed to record recitation", variant: "destructive" }),
      }
    );
  };

  const padCls = size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs";
  const q = currentQuality as Quality | null;

  return (
    <div className={`flex items-center gap-1 ${className}`} onClick={(e) => e.stopPropagation()}>
      {QUALITIES.map(({ value, label, short }) => {
        const isActive = q === value;
        const style = qualityStyle[value];
        return (
          <button
            key={value}
            onClick={(e) => handleClick(e, value)}
            disabled={updatePage.isPending}
            className={`${padCls} rounded-md border font-medium transition-all ${
              isActive ? style.active : `border-border bg-background text-muted-foreground ${style.hover}`
            } disabled:opacity-50`}
            data-testid={`quick-rate-${pageNumber}-${value}`}
            aria-label={`Rate page ${pageNumber} as ${label}`}
          >
            {compact ? short : label}
          </button>
        );
      })}
    </div>
  );
}
