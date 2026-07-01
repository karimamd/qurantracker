import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import {
  useRecordBatchRecitation,
  getListPageProgressQueryKey,
  getGetProgressOverviewQueryKey,
  getListJuzProgressQueryKey,
  getListSurahProgressQueryKey,
  getGetDailyChartQueryKey,
  getGetProgressChartQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FirstAyahPreview } from "@/components/first-ayah-preview";
import { useToast } from "@/hooks/use-toast";
import { SURAHS, JUZ_RANGES } from "@/lib/quran-ref";
import { BookOpen, Info } from "lucide-react";

type Quality = "excellent" | "good" | "hard" | "relearn";

const QUALITY_VALUES: Quality[] = ["excellent", "good", "hard", "relearn"];

const qualityStyle: Record<Quality, string> = {
  excellent: "border-emerald-500 bg-emerald-50 text-emerald-700",
  good: "border-teal-500 bg-teal-50 text-teal-700",
  hard: "border-amber-500 bg-amber-50 text-amber-700",
  relearn: "border-rose-500 bg-rose-50 text-rose-700",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OnboardingScopeSetup({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const recordBatch = useRecordBatchRecitation();

  const [selectedSurahs, setSelectedSurahs] = useState<Set<number>>(new Set());
  const [selectedJuz, setSelectedJuz] = useState<Set<number>>(new Set());
  const [pageStart, setPageStart] = useState<string>("");
  const [pageEnd, setPageEnd] = useState<string>("");
  const [extraPages, setExtraPages] = useState<Set<number>>(new Set());
  const [quality, setQuality] = useState<Quality>("good");
  const [surahSearch, setSurahSearch] = useState("");

  const filteredSurahs = useMemo(() => {
    const q = surahSearch.trim().toLowerCase();
    if (!q) return SURAHS;
    return SURAHS.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.arabic.includes(surahSearch.trim()) ||
        String(s.number) === q,
    );
  }, [surahSearch]);

  const allSelectedPages = useMemo(() => {
    const pages = new Set<number>();
    for (const num of selectedSurahs) {
      const s = SURAHS.find((x) => x.number === num);
      if (s) for (let p = s.startPage; p <= s.endPage; p++) pages.add(p);
    }
    for (const j of selectedJuz) {
      const r = JUZ_RANGES.find((x) => x.juz === j);
      if (r) for (let p = r.startPage; p <= r.endPage; p++) pages.add(p);
    }
    for (const p of extraPages) pages.add(p);
    return pages;
  }, [selectedSurahs, selectedJuz, extraPages]);

  const totalSelected = allSelectedPages.size;

  const toggle = <T,>(set: Set<T>, value: T, setter: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const handleAddPageRange = () => {
    const start = parseInt(pageStart, 10);
    const end = parseInt(pageEnd, 10);
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 1 ||
      end > 604 ||
      start > end
    ) {
      toast({ title: t("onboarding.invalidRange"), variant: "destructive" });
      return;
    }
    const next = new Set(extraPages);
    for (let p = start; p <= end; p++) next.add(p);
    setExtraPages(next);
    setPageStart("");
    setPageEnd("");
  };

  const reset = () => {
    setSelectedSurahs(new Set());
    setSelectedJuz(new Set());
    setExtraPages(new Set());
    setPageStart("");
    setPageEnd("");
  };

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListJuzProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListSurahProgressQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDailyChartQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetProgressChartQueryKey() });
  };

  const handleSubmit = () => {
    const pageNumbers = Array.from(allSelectedPages).sort((a, b) => a - b);
    if (pageNumbers.length === 0) {
      toast({ title: t("onboarding.selectAtLeastOne"), variant: "destructive" });
      return;
    }
    recordBatch.mutate(
      { data: { pageNumbers, quality } },
      {
        onSuccess: () => {
          toast({
            title: t("onboarding.addedToast", {
              count: pageNumbers.length,
              quality: t(`quality.${quality}`),
            }),
          });
          invalidateAll();
          reset();
          onOpenChange(false);
        },
        onError: () => {
          toast({ title: t("errors.failedRecord"), variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl max-h-[90dvh] overflow-hidden flex flex-col p-0 gap-0"
        data-testid="onboarding-scope-dialog"
      >
        {/* Header — always visible */}
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            {t("onboarding.title")}
          </DialogTitle>
          <DialogDescription>{t("onboarding.subtitle")}</DialogDescription>
        </DialogHeader>

        {/* Info box — hidden on small screens to save space */}
        <div className="mx-4 mb-2 shrink-0 hidden sm:flex rounded-lg border bg-muted/30 p-3 text-sm gap-2">
          <Info className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">{t("onboarding.scopeMeaningTitle")}</p>
            <p className="text-muted-foreground">{t("onboarding.scopeMeaning")}</p>
          </div>
        </div>

        {/* Tabs — fills remaining space, scrolls internally */}
        <Tabs defaultValue="surah" className="flex-1 min-h-0 flex flex-col px-4">
          <TabsList className="grid grid-cols-3 w-full shrink-0">
            <TabsTrigger value="surah" data-testid="onboarding-tab-surah">
              {t("onboarding.tabs.surah")}
            </TabsTrigger>
            <TabsTrigger value="juz" data-testid="onboarding-tab-juz">
              {t("onboarding.tabs.juz")}
            </TabsTrigger>
            <TabsTrigger value="pages" data-testid="onboarding-tab-pages">
              {t("onboarding.tabs.pages")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="surah" className="flex-1 min-h-0 mt-3 flex flex-col">
            <Input
              placeholder={t("onboarding.searchSurah")}
              value={surahSearch}
              onChange={(e) => setSurahSearch(e.target.value)}
              className="mb-2 shrink-0"
              data-testid="onboarding-surah-search"
            />
            <ScrollArea className="flex-1 min-h-0 rounded-md border">
                <ul className="divide-y">
                  {filteredSurahs.map((s) => {
                    const checked = selectedSurahs.has(s.number);
                    return (
                      <li key={s.number}>
                        <label
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 cursor-pointer"
                          data-testid={`onboarding-surah-${s.number}`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() =>
                              toggle(selectedSurahs, s.number, setSelectedSurahs)
                            }
                          />
                          <span className="w-7 text-xs text-muted-foreground text-end shrink-0">
                            {s.number}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm">{s.name}</span>
                              <span className="font-serif text-sm text-muted-foreground">
                                {s.arabic}
                              </span>
                            </div>
                            <FirstAyahPreview
                              pageNumber={s.startPage}
                              className="block text-xs"
                              wordCount={6}
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground shrink-0 ms-2">
                            {t("onboarding.pagesRange", {
                              start: s.startPage,
                              end: s.endPage,
                            })}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
          </TabsContent>

          <TabsContent value="juz" className="flex-1 min-h-0 mt-3 flex flex-col">
            <ScrollArea className="flex-1 min-h-0 rounded-md border">
                <ul className="divide-y">
                  {JUZ_RANGES.map((j) => {
                    const checked = selectedJuz.has(j.juz);
                    return (
                      <li key={j.juz}>
                        <label
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 cursor-pointer"
                          data-testid={`onboarding-juz-${j.juz}`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() =>
                              toggle(selectedJuz, j.juz, setSelectedJuz)
                            }
                          />
                          <span className="w-16 text-sm font-medium shrink-0">
                            {t("common.juz")} {j.juz}
                          </span>
                          <div className="flex-1 min-w-0">
                            <FirstAyahPreview
                              pageNumber={j.startPage}
                              className="block text-xs"
                              wordCount={6}
                            />
                          </div>
                          <span className="text-[11px] text-muted-foreground shrink-0 ms-2">
                            {t("onboarding.pagesRange", {
                              start: j.startPage,
                              end: j.endPage,
                            })}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
          </TabsContent>

          <TabsContent value="pages" className="flex-1 min-h-0 mt-3 flex flex-col gap-3 overflow-y-auto">
            <div className="flex flex-wrap items-end gap-2 shrink-0">
              <div className="flex-1 min-w-[90px]">
                <label className="text-xs text-muted-foreground">
                  {t("onboarding.fromPage")}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={604}
                  value={pageStart}
                  onChange={(e) => setPageStart(e.target.value)}
                  data-testid="onboarding-page-start"
                />
              </div>
              <div className="flex-1 min-w-[90px]">
                <label className="text-xs text-muted-foreground">
                  {t("onboarding.toPage")}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={604}
                  value={pageEnd}
                  onChange={(e) => setPageEnd(e.target.value)}
                  data-testid="onboarding-page-end"
                />
              </div>
              <Button
                type="button"
                onClick={handleAddPageRange}
                className="self-end"
                data-testid="onboarding-add-range"
              >
                {t("onboarding.addRange")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground shrink-0">
              {t("onboarding.pagesHint")}
            </p>
            {extraPages.size > 0 && (
              <div className="rounded-md border p-2 text-xs shrink-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">
                    {t("onboarding.addedPages", { count: extraPages.size })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExtraPages(new Set())}
                    className="text-muted-foreground hover:text-foreground"
                    data-testid="onboarding-clear-pages"
                  >
                    {t("common.clear")}
                  </button>
                </div>
                <div className="text-muted-foreground">
                  {Array.from(extraPages)
                    .sort((a, b) => a - b)
                    .slice(0, 30)
                    .join(", ")}
                  {extraPages.size > 30 ? " …" : ""}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Quality picker + count — always visible, never scrolls away */}
        <div className="shrink-0 space-y-3 border-t px-4 pt-3 pb-2 mt-2">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium">
                {t("onboarding.statusTitle")}
              </p>
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground mb-2 hidden sm:block">
              {t("onboarding.statusHint")}
            </p>
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {QUALITY_VALUES.map((q) => {
                const active = quality === q;
                return (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setQuality(q)}
                    className={`text-start rounded-md border-2 px-2 py-2 transition-all ${
                      active
                        ? qualityStyle[q]
                        : "border-border hover:border-primary/40"
                    }`}
                    data-testid={`onboarding-quality-${q}`}
                  >
                    <div className="text-xs font-semibold leading-tight">
                      {t(`quality.${q}`)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 hidden sm:block leading-tight">
                      {t(`onboarding.qualityDesc.${q}`)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t("onboarding.totalSelected", { count: totalSelected })}
            </span>
            {totalSelected > 0 && (
              <button
                type="button"
                onClick={reset}
                className="text-xs text-muted-foreground hover:text-foreground underline"
                data-testid="onboarding-reset"
              >
                {t("onboarding.resetSelection")}
              </button>
            )}
          </div>
        </div>

        {/* Footer — always visible */}
        <DialogFooter className="shrink-0 px-4 pb-4 gap-2 flex-row">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="onboarding-skip"
          >
            {t("onboarding.skip")}
          </Button>
          <Button
            type="button"
            className="flex-1 sm:flex-none"
            onClick={handleSubmit}
            disabled={totalSelected === 0 || recordBatch.isPending}
            data-testid="onboarding-submit"
          >
            {recordBatch.isPending
              ? t("onboarding.submitting")
              : t("onboarding.submit", { count: totalSelected })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
