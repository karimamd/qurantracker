import {
  useListRob3Progress,
  useRecordBatchRecitation,
  getListRob3ProgressQueryKey,
  getListJuzProgressQueryKey,
  getListSurahProgressQueryKey,
  getListPageProgressQueryKey,
  getGetProgressOverviewQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { QualityBadge, getQualityColor } from "@/components/quality-badge";
import { useToast } from "@/hooks/use-toast";
import { Search } from "lucide-react";

type Quality = "excellent" | "good" | "hard" | "relearn";

const QUALITIES: { value: Quality; short: string; label: string }[] = [
  { value: "excellent", short: "Exc", label: "Excellent" },
  { value: "good", short: "Good", label: "Good" },
  { value: "hard", short: "Hard", label: "Hard" },
  { value: "relearn", short: "Re", label: "Relearn" },
];

const qualityStyle: Record<Quality, { active: string; hover: string }> = {
  excellent: { active: "bg-emerald-500 border-emerald-500 text-white", hover: "hover:border-emerald-300 hover:text-emerald-700" },
  good: { active: "bg-sky-500 border-sky-500 text-white", hover: "hover:border-sky-300 hover:text-sky-700" },
  hard: { active: "bg-amber-500 border-amber-500 text-white", hover: "hover:border-amber-300 hover:text-amber-700" },
  relearn: { active: "bg-rose-500 border-rose-500 text-white", hover: "hover:border-rose-300 hover:text-rose-700" },
};

export default function Rob3List() {
  const { data: rob3s, isLoading } = useListRob3Progress();
  const recordBatch = useRecordBatchRecitation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [pendingRob3, setPendingRob3] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (!rob3s) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rob3s;
    return rob3s.filter(r =>
      r.rob3Number.toString() === q ||
      r.juzNumber.toString() === q ||
      r.juzName.toLowerCase().includes(q) ||
      r.startSurahName.toLowerCase().includes(q)
    );
  }, [rob3s, search]);

  const handleRate = (rob3: NonNullable<typeof rob3s>[number], quality: Quality) => {
    const pageNumbers: number[] = [];
    for (let p = rob3.startPage; p <= rob3.endPage; p++) pageNumbers.push(p);
    setPendingRob3(rob3.rob3Number);
    recordBatch.mutate(
      { data: { pageNumbers, quality } },
      {
        onSuccess: () => {
          toast({
            title: `Part ${rob3.rob3Number} marked`,
            description: `${pageNumbers.length} page${pageNumbers.length === 1 ? "" : "s"} set to ${quality}.`,
          });
          queryClient.invalidateQueries({ queryKey: getListRob3ProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListJuzProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListSurahProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() });
        },
        onError: () => toast({ title: "Failed to record recitation", variant: "destructive" }),
        onSettled: () => setPendingRob3(prev => (prev === rob3.rob3Number ? null : prev)),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Rub' (Parts) Overview</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="rob3-list-page">
      <div>
        <h2 className="text-2xl font-semibold">Rub' (Parts) Overview</h2>
        <p className="text-sm text-muted-foreground mt-1">
          All 240 Rub' al-Hizb. Marking a Part applies that quality to every page in its range.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by part #, juz, or surah..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          data-testid="rob3-search"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(rob3 => {
          const isBusy = recordBatch.isPending && pendingRob3 === rob3.rob3Number;
          const q = rob3.averageQuality as Quality | null;
          return (
            <Card
              key={rob3.rob3Number}
              className="border shadow-sm hover:shadow-md transition-shadow"
              data-testid={`rob3-card-${rob3.rob3Number}`}
            >
              <CardContent className="pt-4 pb-4 px-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <div className={`w-1.5 h-10 rounded-full shrink-0 mt-0.5 ${getQualityColor(rob3.averageQuality)}`} />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">
                        Part {rob3.rob3Number}
                        <span className="text-muted-foreground font-normal"> · {rob3.juzName} · {rob3.partInJuz}/8</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Pages {rob3.startPage}–{rob3.endPage} · starts at {rob3.startSurahName} {rob3.startAyah}
                      </div>
                    </div>
                  </div>
                  <QualityBadge quality={rob3.averageQuality} />
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{rob3.pagesInScope}/{rob3.totalPages} in scope</span>
                  {rob3.pagesOverdue > 0 && (
                    <span className="text-rose-600 font-medium">{rob3.pagesOverdue} overdue</span>
                  )}
                  {rob3.lastRecited && (
                    <span>Last: {new Date(rob3.lastRecited).toLocaleDateString()}</span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {QUALITIES.map(({ value, short, label }) => {
                    const isActive = q === value;
                    const style = qualityStyle[value];
                    return (
                      <button
                        key={value}
                        onClick={() => handleRate(rob3, value)}
                        disabled={isBusy}
                        className={`flex-1 px-2 py-1 rounded-md border text-xs font-medium transition-all ${
                          isActive ? style.active : `border-border bg-background text-muted-foreground ${style.hover}`
                        } disabled:opacity-50`}
                        data-testid={`rob3-rate-${rob3.rob3Number}-${value}`}
                        aria-label={`Mark Part ${rob3.rob3Number} as ${label}`}
                      >
                        {short}
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-sm text-muted-foreground py-12">
          No parts match "{search}".
        </div>
      )}
    </div>
  );
}
