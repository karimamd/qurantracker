import type { ReactNode } from "react";
import type { QueryKey } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Check, BookMarked } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { PageLabel } from "@/components/page-label";
import { PageQualityButtons } from "@/components/page-quality-buttons";
import { QualityBadge } from "@/components/quality-badge";
import { FirstAyahPreview } from "@/components/first-ayah-preview";
import {
  type Quality,
  QUALITIES,
  qualityStyle,
  dotStyle,
  rowStyle,
  getStatusBarColor,
  isCompletedQuality,
} from "@/lib/quality";

export interface PageRowProps {
  pageNumber: number;
  customName?: string | null;
  quality: string | null;
  status: string;
  inScope: boolean;
  lastRecited?: Date | string | null;
  weekCount?: number | null;
  mistakes?: number | null;
  surahLabel?: string | null;
  /** Query keys to invalidate on quality change. Used when onQualitySelect is NOT provided. */
  invalidateKeys?: QueryKey[];
  /** Forwarded to PageLabel rename popover for cache invalidation context. */
  homeworkId?: number;
  juzNumber?: number;
  highlight?: boolean;
  highlightLabel?: string;
  /** Slot for type/category badges shown next to the page label. */
  extraBadges?: ReactNode;
  /** Slot for trailing actions (e.g. a "clear" button). */
  extraActions?: ReactNode;
  /** Override the quality-update mutation. If omitted, PageQualityButtons (PATCH page progress) is used. */
  onQualitySelect?: (quality: Quality) => void;
  qualityPending?: boolean;
  showFirstAyah?: boolean;
  testIdPrefix?: string;
  /** Unique identifier used in test ids. Defaults to pageNumber.
   *  Override (e.g. with a homework item id) when the same page can appear
   *  multiple times in a single list to avoid duplicate selectors. */
  rowId?: string | number;
}

export function PageRow({
  pageNumber,
  customName,
  quality,
  status,
  inScope,
  lastRecited,
  weekCount,
  mistakes,
  surahLabel,
  invalidateKeys = [],
  homeworkId,
  juzNumber,
  highlight = false,
  highlightLabel,
  extraBadges,
  extraActions,
  onQualitySelect,
  qualityPending = false,
  showFirstAyah = true,
  testIdPrefix = "page-row",
  rowId,
}: PageRowProps) {
  const tid = rowId ?? pageNumber;
  const [, setLocation] = useLocation();
  const q = quality as Quality | null | undefined;
  const hasQuality = !!q;
  const completed = isCompletedQuality(quality);
  const lastRecitedAt = lastRecited ? format(new Date(lastRecited), "MMM d, h:mm a") : null;

  const bgClass = highlight
    ? "bg-violet-50/70 border-l-4 border-l-violet-400"
    : hasQuality
    ? rowStyle[q!]
    : "hover:bg-muted/30";

  return (
    <div
      className={`px-4 py-3 transition-colors relative ${bgClass}`}
      data-testid={`${testIdPrefix}-${tid}`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {/* Status / completion dot */}
          <div
            className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              hasQuality ? dotStyle[q!] : "border-muted-foreground/30 bg-transparent"
            }`}
            title={hasQuality ? `Quality: ${q}` : `Status: ${status.replace("_", " ")}`}
          >
            {hasQuality ? (
              <Check className="w-3 h-3 text-white" strokeWidth={3} />
            ) : (
              <span className={`w-2 h-2 rounded-full ${getStatusBarColor(status)}`} />
            )}
          </div>

          {/* Page label + badges + first ayah preview + meta line */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm font-medium ${completed ? "text-muted-foreground line-through" : ""}`}>
                <PageLabel
                  pageNumber={pageNumber}
                  customName={customName ?? null}
                  homeworkId={homeworkId}
                  juzNumber={juzNumber}
                  prefixClassName="text-sm font-medium"
                  nameClassName="text-base"
                />
              </span>
              {extraBadges}
              {hasQuality && <QualityBadge quality={quality} />}
              {highlight && highlightLabel && (
                <Badge
                  className="text-xs py-0 bg-violet-500 hover:bg-violet-500 text-white border-0"
                  data-testid={`${testIdPrefix}-highlight-${tid}`}
                >
                  {highlightLabel}
                </Badge>
              )}
              {weekCount != null && weekCount > 0 && (
                <span
                  className="text-xs font-semibold bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded-full border border-sky-200"
                  title={`Recited ${weekCount}× in the past 7 days`}
                  data-testid={`${testIdPrefix}-week-count-${tid}`}
                >
                  {weekCount}× this week
                </span>
              )}
              {mistakes != null && mistakes > 0 && (
                <span
                  className="text-xs font-semibold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full border border-rose-200"
                  title={`${mistakes} recorded mistake${mistakes === 1 ? "" : "s"}`}
                  data-testid={`${testIdPrefix}-mistakes-${tid}`}
                >
                  {mistakes} mistake{mistakes === 1 ? "" : "s"}
                </span>
              )}
            </div>

            {showFirstAyah && (
              <div className="mt-1.5 max-w-full overflow-hidden text-sm sm:text-base">
                <FirstAyahPreview pageNumber={pageNumber} className="block max-w-full" />
              </div>
            )}

            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
              {surahLabel && <span className="truncate">{surahLabel}</span>}
              {lastRecitedAt && (
                <span data-testid={`${testIdPrefix}-last-recited-${tid}`}>
                  Last recited: {lastRecitedAt}
                </span>
              )}
              {!inScope && <span className="italic">Not in memorization scope</span>}
            </div>
          </div>
        </div>

        {/* Actions: Read button, Quality picker, extras */}
        <div className="flex items-center gap-1 shrink-0 ml-auto flex-wrap justify-end">
          <button
            type="button"
            onClick={() => setLocation(`/reader/${pageNumber}`)}
            className="mr-1 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border bg-background text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title={`Open page ${pageNumber} in Reader`}
            aria-label={`Open page ${pageNumber} in Reader`}
            data-testid={`${testIdPrefix}-open-reader-${tid}`}
          >
            <BookMarked className="w-3 h-3" />
            <span className="hidden sm:inline">Read</span>
          </button>

          {inScope ? (
            onQualitySelect ? (
              <div className="flex items-center gap-1">
                {QUALITIES.map(({ value, label }) => {
                  const isActive = q === value;
                  const style = qualityStyle[value];
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onQualitySelect(value)}
                      disabled={qualityPending}
                      className={`text-xs px-2 py-1 rounded-md border font-medium transition-all ${
                        isActive ? style.active : `border-border bg-background text-muted-foreground ${style.hover}`
                      } disabled:opacity-50`}
                      data-testid={`${testIdPrefix}-quality-btn-${tid}-${value}`}
                      aria-label={`Mark page ${pageNumber} as ${label}`}
                      aria-pressed={isActive}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            ) : (
              <PageQualityButtons
                pageNumber={pageNumber}
                currentQuality={quality}
                size="sm"
                invalidateKeys={invalidateKeys}
              />
            )
          ) : null}

          {extraActions}
        </div>
      </div>
    </div>
  );
}
