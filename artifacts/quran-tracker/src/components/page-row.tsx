import type { ReactNode } from "react";
import type { QueryKey } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Check, BookMarked } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { PageLabel } from "@/components/page-label";
import { PageQualityButtons } from "@/components/page-quality-buttons";
import {
  type Quality,
  QUALITIES,
  qualityStyle,
  dotStyle,
  rowStyle,
  getStatusBarColor,
  isCompletedQuality,
} from "@/lib/quality";
import { useTranslation } from "react-i18next";

export interface PageRowProps {
  pageNumber: number;
  customName?: string | null;
  quality: string | null;
  effectiveQuality?: string | null;
  qualityDowngrades?: number;
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
  testIdPrefix = "page-row",
  rowId,
}: PageRowProps) {
  const tid = rowId ?? pageNumber;
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const q = quality as Quality | null | undefined;
  const hasQuality = !!q;
  const completed = isCompletedQuality(quality);
  const lastRecitedAt = lastRecited ? format(new Date(lastRecited), "MMM d, h:mm a") : null;

  const bgClass = highlight
    ? "bg-violet-50/70 border-s-4 border-s-violet-400"
    : hasQuality
    ? rowStyle[q!]
    : "hover:bg-muted/30";

  return (
    <div
      className={`px-4 py-3 transition-colors relative ${bgClass}`}
      data-testid={`${testIdPrefix}-${tid}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1 w-full">
          {/* Status / completion dot */}
          <div
            className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
              hasQuality ? dotStyle[q!] : "border-muted-foreground/30 bg-transparent"
            }`}
            title={hasQuality ? `${t("common.quality")}: ${t(`quality.${q}`)}` : `${t("common.status")}: ${t(`status.${status}`)}`}
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
                  className="text-xs font-semibold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full border border-teal-200"
                  data-testid={`${testIdPrefix}-week-count-${tid}`}
                >
                  {t("pageRow.thisWeek", { count: weekCount })}
                </span>
              )}
              {mistakes != null && mistakes > 0 && (
                <span
                  className="text-xs font-semibold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full border border-rose-200"
                  data-testid={`${testIdPrefix}-mistakes-${tid}`}
                >
                  {t("reader.mistakes", { count: mistakes })}
                </span>
              )}
            </div>

            <div className="flex items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1 flex-wrap">
              {surahLabel && <span className="whitespace-nowrap truncate max-w-full">{surahLabel}</span>}
              {lastRecitedAt && (
                <span
                  className="whitespace-nowrap"
                  data-testid={`${testIdPrefix}-last-recited-${tid}`}
                >
                  {t("common.lastRecited")}: {lastRecitedAt}
                </span>
              )}
              {!inScope && <span className="italic whitespace-nowrap">{t("status.out_of_scope")}</span>}
            </div>
          </div>
        </div>

        {/* Actions: Read button, Quality picker, extras */}
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-start sm:justify-end sm:ms-auto ps-8 sm:ps-0">
          <button
            type="button"
            onClick={() => setLocation(`/reader/${pageNumber}`)}
            className="me-1 inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border border-border bg-background text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            title={t("reader.openReader")}
            aria-label={t("reader.openReader")}
            data-testid={`${testIdPrefix}-open-reader-${tid}`}
          >
            <BookMarked className="w-3 h-3" />
            <span className="hidden sm:inline">{t("common.open")}</span>
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
                      aria-pressed={isActive}
                    >
                      {t(`quality.${value}`)}
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
