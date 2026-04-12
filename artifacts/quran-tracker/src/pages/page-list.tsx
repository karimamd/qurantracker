import { useListPageProgress, useAddToScope, useRemoveFromScope, getListPageProgressQueryKey } from "@workspace/api-client-react";
import type { ListPageProgressParams, ListPageProgressStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { QualityBadge, StatusBadge } from "@/components/quality-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Minus } from "lucide-react";

export default function PageList() {
  const [juzFilter, setJuzFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");

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
          toast({ title: `Added ${selectedPages.size} pages to scope` });
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
          toast({ title: `Removed ${selectedPages.size} pages from scope` });
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
        <h2 className="text-2xl font-semibold">Pages</h2>
        <p className="text-sm text-muted-foreground mt-1">All 604 pages of the Quran</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={juzFilter} onValueChange={setJuzFilter}>
          <SelectTrigger className="w-36" data-testid="filter-juz">
            <SelectValue placeholder="All Juz" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Juz</SelectItem>
            {Array.from({ length: 30 }, (_, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>Juz {i + 1}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="filter-status">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="due_soon">Due Soon</SelectItem>
            <SelectItem value="on_track">On Track</SelectItem>
            <SelectItem value="not_started">Not Started</SelectItem>
          </SelectContent>
        </Select>

        <Select value={scopeFilter} onValueChange={setScopeFilter}>
          <SelectTrigger className="w-36" data-testid="filter-scope">
            <SelectValue placeholder="All Scope" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Scope</SelectItem>
            <SelectItem value="true">In Scope</SelectItem>
            <SelectItem value="false">Not in Scope</SelectItem>
          </SelectContent>
        </Select>

        {selectedPages.size > 0 && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">{selectedPages.size} selected</span>
            <Button size="sm" onClick={handleAddToScope} disabled={addToScope.isPending} data-testid="btn-add-scope">
              <Plus className="w-3 h-3 mr-1" /> Add to Scope
            </Button>
            <Button size="sm" variant="outline" onClick={handleRemoveFromScope} disabled={removeFromScope.isPending} data-testid="btn-remove-scope">
              <Minus className="w-3 h-3 mr-1" /> Remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedPages(new Set())} data-testid="btn-clear-selection">
              Clear
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
            Select All in Juz
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-4 md:grid-cols-8 lg:grid-cols-12 gap-2">
          {Array.from({ length: 24 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)}
        </div>
      ) : (
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
                {page.quality && <div className="text-[9px] capitalize truncate">{page.quality}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
