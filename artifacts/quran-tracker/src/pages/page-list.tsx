import {
  useListPageProgress,
  useAddToScope,
  useRemoveFromScope,
  getListPageProgressQueryKey,
  getGetProgressOverviewQueryKey,
} from "@workspace/api-client-react";
import type { ListPageProgressParams, ListPageProgressStatus } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QualityBadge, StatusBadge } from "@/components/quality-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Minus, LayoutGrid, LayoutList } from "lucide-react";
import { format } from "date-fns";
import { PageLabel } from "@/components/page-label";
import { PageQualityButtons } from "@/components/page-quality-buttons";
import { useTranslation } from "react-i18next";

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return format(new Date(d), "MMM d, yyyy");
}

export default function PageList() {
  const { t } = useTranslation();
  const dueDateLabel = (daysUntilDue: number | null, dueDate: Date | string | null | undefined): string => {
    if (!dueDate) return "—";
    if (daysUntilDue === null) return formatDate(dueDate);
    if (daysUntilDue < 0) return t("pageList.dueIn.overdue", { count: Math.abs(daysUntilDue) });
    if (daysUntilDue === 0) return t("pageList.dueIn.today");
    if (daysUntilDue === 1) return t("pageList.dueIn.tomorrow");
    return t("pageList.dueIn.inDays", { count: daysUntilDue });
  };
  const [juzFilter, setJuzFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const params = useMemo<ListPageProgressParams>(() => {
    const p: ListPageProgressParams = {};
    if (juzFilter !== "all") p.juz = parseInt(juzFilter, 10);
    if (statusFilter !== "all") p.status = statusFilter as ListPageProgressStatus;
    if (scopeFilter !== "all") p.inScope = scopeFilter === "true";
    return p;
  }, [juzFilter, statusFilter, scopeFilter]);

  const { data: pages, isLoading } = useListPageProgress(params);
  const addToScope = useAddToScope();
  const removeFromScope = useRemoveFromScope();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());

  const togglePage = (pageNumber: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      if (next.has(pageNumber)) next.delete(pageNumber);
      else next.add(pageNumber);
      return next;
    });
  };

  const handleAddToScope = () => {
    if (selectedPages.size === 0) return;
    addToScope.mutate(
      { data: { pageNumbers: Array.from(selectedPages) } },
      {
        onSuccess: () => {
          toast({ title: t("pageList.addedToScope", { count: selectedPages.size }) });
          setSelectedPages(new Set());
          queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey(params) });
        },
      }
    );
  };

  const handleRemoveFromScope = () => {
    if (selectedPages.size === 0) return;
    removeFromScope.mutate(
      { data: { pageNumbers: Array.from(selectedPages) } },
      {
        onSuccess: () => {
          toast({ title: t("pageList.removedFromScope", { count: selectedPages.size }) });
          setSelectedPages(new Set());
          queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey(params) });
        },
      }
    );
  };

  const selectRange = (start: number, end: number) => {
    setSelectedPages(prev => {
      const next = new Set(prev);
      for (let i = start; i <= end; i++) next.add(i);
      return next;
    });
  };

  return (
    <div className="space-y-4" data-testid="page-list-page">
      <div>
        <h2 className="text-2xl font-semibold">{t("pageList.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("pageList.subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={juzFilter} onValueChange={setJuzFilter}>
          <SelectTrigger className="w-36" data-testid="filter-juz">
            <SelectValue placeholder={t("pageList.filters.allJuz")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pageList.filters.allJuz")}</SelectItem>
            {Array.from({ length: 30 }, (_, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{t("pageList.filters.juzN", { n: i + 1 })}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="filter-status">
            <SelectValue placeholder={t("pageList.filters.allStatus")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pageList.filters.allStatus")}</SelectItem>
            <SelectItem value="overdue">{t("status.overdue")}</SelectItem>
            <SelectItem value="due_soon">{t("status.due_soon")}</SelectItem>
            <SelectItem value="on_track">{t("status.on_track")}</SelectItem>
            <SelectItem value="not_started">{t("status.not_started")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-36" data-testid="filter-scope">
            <SelectValue placeholder={t("pageList.filters.allScope")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("pageList.filters.allScope")}</SelectItem>
            <SelectItem value="true">{t("pageList.filters.inScope")}</SelectItem>
            <SelectItem value="false">{t("pageList.filters.notInScope")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-1 border rounded-md p-0.5 ms-auto">
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setViewMode("grid")}
            aria-label={t("pageList.view.grid")}
            data-testid="btn-grid-view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant={viewMode === "list" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setViewMode("list")}
            aria-label={t("pageList.view.list")}
            data-testid="btn-list-view"
          >
            <LayoutList className="w-3.5 h-3.5" />
          </Button>
        </div>

        {selectedPages.size > 0 && (
          <div className="flex items-center gap-2 w-full sm:w-auto sm:ms-2">
            <span className="text-sm text-muted-foreground">{t("pageList.selectedCount", { count: selectedPages.size })}</span>
            <Button size="sm" onClick={handleAddToScope} disabled={addToScope.isPending} data-testid="btn-add-scope">
              <Plus className="w-3 h-3 me-1" /> {t("pageList.addToScope")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleRemoveFromScope} disabled={removeFromScope.isPending} data-testid="btn-remove-scope">
              <Minus className="w-3 h-3 me-1" /> {t("pageList.remove")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedPages(new Set())} data-testid="btn-clear-selection">
              {t("common.clear")}
            </Button>
          </div>
        )}
      </div>

      {juzFilter !== "all" && (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => {
            const juzNum = parseInt(juzFilter, 10);
            const start = (juzNum - 1) * 20 + 1;
            const end = Math.min(juzNum * 20 + 4, 604);
            selectRange(start, end);
          }} data-testid="btn-select-all-juz">
            {t("pageList.selectAllJuz")}
          </Button>
        </div>
      )}

      {isLoading ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-2">
            {Array.from({ length: 24 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
          </div>
        )
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-12 gap-1.5">
          {pages?.map(page => {
            const isSelected = selectedPages.has(page.pageNumber);
            return (
              <button
                key={page.pageNumber}
                onClick={() => togglePage(page.pageNumber)}
                className={`p-1.5 rounded-md border text-center text-xs transition-all cursor-pointer ${
                  isSelected
                    ? "ring-2 ring-primary border-primary bg-primary/10"
                    : page.status === "overdue"
                    ? "bg-rose-50 border-rose-200"
                    : page.status === "due_soon"
                    ? "bg-amber-50 border-amber-200"
                    : page.status === "on_track"
                    ? "bg-emerald-50 border-emerald-200"
                    : page.status === "not_started"
                    ? "bg-blue-50 border-blue-200"
                    : "bg-gray-50 border-gray-100"
                }`}
                data-testid={`page-tile-${page.pageNumber}`}
              >
                <div className="font-semibold text-[11px]">{page.pageNumber}</div>
                {page.quality && <div className="text-[9px] truncate">{t(`quality.${page.quality}`)}</div>}
              </button>
            );
          })}
        </div>
      ) : (
        <Card className="border shadow-sm overflow-hidden">
          <div className="hidden sm:grid grid-cols-[56px_1fr_90px_90px_110px_110px_80px] gap-x-4 px-4 py-2 bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <span>{t("pageList.headers.page")}</span>
            <span>{t("pageList.headers.name")}</span>
            <span>{t("pageList.headers.quality")}</span>
            <span>{t("pageList.headers.status")}</span>
            <span>{t("pageList.headers.lastRecited")}</span>
            <span>{t("pageList.headers.dueDate")}</span>
            <span className="text-end">{t("pageList.headers.dueIn")}</span>
          </div>
          <div className="divide-y max-h-[70vh] overflow-y-auto" data-testid="page-list-rows">
            {pages?.map(page => {
              const isSelected = selectedPages.has(page.pageNumber);
              const surahList = page.surahs ? page.surahs.split(", ") : [];

              return (
                <div
                  key={page.pageNumber}
                  onClick={() => togglePage(page.pageNumber)}
                  className={`cursor-pointer transition-colors px-4 py-3 ${
                    isSelected
                      ? "bg-primary/10 ring-inset ring-1 ring-primary"
                      : page.status === "overdue"
                      ? "hover:bg-rose-50/60 bg-rose-50/30"
                      : page.status === "due_soon"
                      ? "hover:bg-amber-50/60 bg-amber-50/30"
                      : page.status === "on_track"
                      ? "hover:bg-emerald-50/30"
                      : "hover:bg-muted/40"
                  }`}
                  data-testid={`page-row-${page.pageNumber}`}
                >
                  <div className="hidden sm:grid grid-cols-[56px_1fr_90px_90px_110px_110px_80px] gap-x-4 items-center">
                    <span className="font-semibold text-sm">{page.pageNumber}</span>
                    <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                      <PageLabel
                        pageNumber={page.pageNumber}
                        customName={page.customName}
                        prefixClassName="sr-only"
                        nameClassName="text-base"
                      />
                      <div className="flex flex-wrap gap-1 mt-1">
                        {surahList.map(s => (
                          <span key={s} className="text-[10px] bg-muted px-1.5 py-0.5 rounded-md truncate max-w-[140px] text-muted-foreground">{s}</span>
                        ))}
                      </div>
                    </div>
                    <div>{page.quality ? <QualityBadge quality={page.quality} effectiveQuality={page.effectiveQuality} qualityDowngrades={page.qualityDowngrades} /> : <span className="text-xs text-muted-foreground">—</span>}</div>
                    <div><StatusBadge status={page.status} /></div>
                    <span className="text-xs text-muted-foreground">{formatDate(page.lastRecited)}</span>
                    <span className="text-xs text-muted-foreground">{formatDate(page.dueDate)}</span>
                    <span className={`text-xs font-medium text-end ${
                      page.daysUntilDue !== null && page.daysUntilDue < 0
                        ? "text-rose-600"
                        : page.daysUntilDue !== null && page.daysUntilDue <= 3
                        ? "text-amber-600"
                        : "text-muted-foreground"
                    }`}>
                      {dueDateLabel(page.daysUntilDue ?? null, page.dueDate)}
                    </span>
                  </div>

                  <div className="sm:hidden flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-1 h-10 rounded-full shrink-0 ${
                        page.status === "overdue" ? "bg-rose-500"
                        : page.status === "due_soon" ? "bg-amber-400"
                        : page.status === "on_track" ? "bg-emerald-500"
                        : "bg-blue-400"
                      }`} />
                      <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                        <PageLabel
                          pageNumber={page.pageNumber}
                          customName={page.customName}
                          prefixClassName="font-semibold text-sm"
                          nameClassName="text-sm"
                        />
                        <div className="text-xs text-muted-foreground truncate">
                          {surahList[0] ?? "—"}{surahList.length > 1 ? ` +${surahList.length - 1}` : ""}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {page.quality ? <QualityBadge quality={page.quality} effectiveQuality={page.effectiveQuality} qualityDowngrades={page.qualityDowngrades} /> : null}
                      <span className={`text-xs font-medium ${
                        page.daysUntilDue !== null && page.daysUntilDue < 0
                          ? "text-rose-600"
                          : page.daysUntilDue !== null && page.daysUntilDue <= 3
                          ? "text-amber-600"
                          : "text-muted-foreground"
                      }`}>
                        {dueDateLabel(page.daysUntilDue ?? null, page.dueDate)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{formatDate(page.lastRecited)}</span>
                    </div>
                  </div>
                  {page.inScope && (
                    <div className="mt-2 sm:ps-[60px]" onClick={(e) => e.stopPropagation()}>
                      <PageQualityButtons
                        pageNumber={page.pageNumber}
                        currentQuality={page.quality}
                        size="xs"
                        invalidateKeys={[
                          getListPageProgressQueryKey(params),
                          getListPageProgressQueryKey(),
                          getGetProgressOverviewQueryKey(),
                        ]}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {(!pages || pages.length === 0) && (
              <div className="py-12 text-center text-sm text-muted-foreground">{t("pageList.noMatch")}</div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
