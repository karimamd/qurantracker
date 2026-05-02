import {
  useRecordBatchRecitation,
  getListPageProgressQueryKey,
  getGetProgressOverviewQueryKey,
  getListJuzProgressQueryKey,
  getListSurahProgressQueryKey,
  getGetRecentActivityQueryKey,
  getListHomeworkQueryKey,
} from "@workspace/api-client-react";
import type { BatchRecitationBodyQuality } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Search } from "lucide-react";
import { JUZ_RANGES, SURAHS, pagesForJuz, pagesForSurah, todayLocalISO } from "@/lib/quran-ref";
import { useTranslation } from "react-i18next";

type Mode = "juz" | "surah" | "pages";

export default function Recite() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("pages");

  const [selectedJuz, setSelectedJuz] = useState<string>("");
  const [surahSearch, setSurahSearch] = useState("");
  const [selectedSurah, setSelectedSurah] = useState<string>("");
  const [pageStart, setPageStart] = useState("");
  const [pageEnd, setPageEnd] = useState("");

  const [quality, setQuality] = useState<BatchRecitationBodyQuality>("good");
  const [mistakes, setMistakes] = useState("");
  const [recitedDate, setRecitedDate] = useState(todayLocalISO());
  const [submitted, setSubmitted] = useState(false);

  const recordBatch = useRecordBatchRecitation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredSurahs = useMemo(() => {
    const q = surahSearch.toLowerCase();
    if (!q) return SURAHS;
    return SURAHS.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.arabic.includes(q) ||
      String(s.number) === q
    );
  }, [surahSearch]);

  const resolvedPages = useMemo<number[]>(() => {
    if (mode === "juz" && selectedJuz) {
      return pagesForJuz(parseInt(selectedJuz, 10));
    }
    if (mode === "surah" && selectedSurah) {
      return pagesForSurah(parseInt(selectedSurah, 10));
    }
    if (mode === "pages" && pageStart) {
      const start = parseInt(pageStart, 10);
      const end = pageEnd ? parseInt(pageEnd, 10) : start;
      if (!isNaN(start) && !isNaN(end) && start >= 1 && end <= 604 && end >= start) {
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
      }
    }
    return [];
  }, [mode, selectedJuz, selectedSurah, pageStart, pageEnd]);

  const pagePreviewLabel = useMemo(() => {
    if (resolvedPages.length === 0) return null;
    if (resolvedPages.length === 1) return t("recite.preview.single", { n: resolvedPages[0] });
    return t("recite.preview.range", { start: resolvedPages[0], end: resolvedPages[resolvedPages.length - 1], count: resolvedPages.length });
  }, [resolvedPages, t]);

  const handleSubmit = () => {
    if (resolvedPages.length === 0) {
      toast({ title: t("recite.selectError"), variant: "destructive" });
      return;
    }

    const recitedAt = new Date(recitedDate + "T12:00:00").toISOString();

    recordBatch.mutate(
      { data: { pageNumbers: resolvedPages, quality, mistakes: mistakes ? parseInt(mistakes, 10) : undefined, recitedAt } },
      {
        onSuccess: () => {
          setSubmitted(true);
          toast({ title: t("recite.recordedToast", { count: resolvedPages.length, quality: t(`quality.${quality}`) }) });
          queryClient.invalidateQueries({ queryKey: getListPageProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetProgressOverviewQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListJuzProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListSurahProgressQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetRecentActivityQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListHomeworkQueryKey() });
          queryClient.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("/api/homework/") });
          setTimeout(() => setSubmitted(false), 3000);
        },
      }
    );
  };

  const qualityOptions: { value: BatchRecitationBodyQuality; ring: string }[] = [
    { value: "excellent", ring: "border-emerald-400 bg-emerald-50" },
    { value: "good", ring: "border-teal-400 bg-teal-50" },
    { value: "hard", ring: "border-amber-400 bg-amber-50" },
    { value: "relearn", ring: "border-rose-400 bg-rose-50" },
  ];

  const modeLabels: Record<Mode, string> = {
    juz: t("recite.modeJuz"),
    surah: t("recite.modeSurah"),
    pages: t("recite.modePages"),
  };

  return (
    <div className="space-y-5 max-w-2xl" data-testid="recite-page">
      <div>
        <h2 className="text-2xl font-semibold">{t("recite.title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("recite.subtitle")}</p>
      </div>

      {submitted && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl" data-testid="success-message">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">{t("recite.success")}</span>
        </div>
      )}

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("recite.selectPages")}</CardTitle>
          <div className="flex gap-1 mt-2 bg-muted rounded-lg p-1 w-fit" data-testid="mode-tabs">
            {(["juz", "surah", "pages"] as Mode[]).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  mode === m ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`mode-tab-${m}`}
              >
                {modeLabels[m]}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {mode === "juz" && (
            <div data-testid="mode-juz-panel">
              <Label>{t("recite.selectJuz")}</Label>
              <Select value={selectedJuz} onValueChange={setSelectedJuz}>
                <SelectTrigger data-testid="select-juz">
                  <SelectValue placeholder={t("recite.chooseJuz")} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {JUZ_RANGES.map(j => (
                    <SelectItem key={j.juz} value={String(j.juz)}>
                      {t("recite.juzPages", { n: j.juz, start: j.startPage, end: j.endPage })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {mode === "surah" && (
            <div className="space-y-2" data-testid="mode-surah-panel">
              <Label>{t("recite.selectSurah")}</Label>
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="ps-9"
                  placeholder={t("recite.searchSurah")}
                  value={surahSearch}
                  onChange={e => setSurahSearch(e.target.value)}
                  data-testid="surah-search-input"
                />
              </div>
              <div className="border rounded-lg overflow-y-auto max-h-52 divide-y" data-testid="surah-list">
                {filteredSurahs.map(s => (
                  <button
                    key={s.number}
                    onClick={() => { setSelectedSurah(String(s.number)); setSurahSearch(""); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 text-sm hover:bg-muted/50 transition-colors text-start ${
                      selectedSurah === String(s.number) ? "bg-primary/8 font-medium" : ""
                    }`}
                    data-testid={`surah-option-${s.number}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                        {s.number}
                      </span>
                      <span>{s.name}</span>
                      <span className="text-muted-foreground font-serif text-sm">{s.arabic}</span>
                    </span>
                    <span className="text-muted-foreground text-xs shrink-0 ms-2">{t("recite.surahPageHint", { start: s.startPage, end: s.endPage !== s.startPage ? `–${s.endPage}` : "" })}</span>
                  </button>
                ))}
              </div>
              {selectedSurah && (() => {
                const s = SURAHS.find(s => s.number === parseInt(selectedSurah, 10));
                return s ? (
                  <div className="flex items-center gap-2 text-sm text-primary font-medium" data-testid="selected-surah-label">
                    <CheckCircle className="w-4 h-4" /> {t("recite.selectedSurah", { name: s.name })}
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {mode === "pages" && (
            <div className="grid grid-cols-2 gap-4" data-testid="mode-pages-panel">
              <div>
                <Label htmlFor="pageStart">{t("recite.startPage")}</Label>
                <Input
                  id="pageStart"
                  type="number"
                  min={1}
                  max={604}
                  placeholder="1"
                  value={pageStart}
                  onChange={e => setPageStart(e.target.value)}
                  data-testid="input-page-start"
                />
              </div>
              <div>
                <Label htmlFor="pageEnd">{t("recite.endPage")}</Label>
                <Input
                  id="pageEnd"
                  type="number"
                  min={1}
                  max={604}
                  placeholder={t("recite.endPagePlaceholder")}
                  value={pageEnd}
                  onChange={e => setPageEnd(e.target.value)}
                  data-testid="input-page-end"
                />
              </div>
            </div>
          )}

          {pagePreviewLabel && (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-md px-3 py-2" data-testid="page-preview">
              {pagePreviewLabel}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("recite.date")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="date"
            value={recitedDate}
            onChange={e => setRecitedDate(e.target.value)}
            max={todayLocalISO()}
            data-testid="input-recited-date"
          />
          <p className="text-xs text-muted-foreground mt-1.5">{t("recite.dateHint")}</p>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("recite.qualityRating")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={quality}
            onValueChange={(v) => setQuality(v as BatchRecitationBodyQuality)}
            className="grid grid-cols-2 gap-3"
          >
            {qualityOptions.map(opt => (
              <Label
                key={opt.value}
                htmlFor={`quality-${opt.value}`}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${opt.ring} ${
                  quality === opt.value ? "ring-2 ring-offset-1 ring-primary/40" : ""
                }`}
                data-testid={`quality-option-${opt.value}`}
              >
                <RadioGroupItem value={opt.value} id={`quality-${opt.value}`} />
                <div>
                  <div className="font-medium text-sm">{t(`quality.${opt.value}`)}</div>
                  <div className="text-xs text-muted-foreground">{t(`recite.qualityDesc.${opt.value}`)}</div>
                </div>
              </Label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("recite.mistakes")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            min={0}
            placeholder={t("recite.mistakesPlaceholder")}
            value={mistakes}
            onChange={e => setMistakes(e.target.value)}
            data-testid="input-mistakes"
          />
        </CardContent>
      </Card>

      <Button
        onClick={handleSubmit}
        disabled={resolvedPages.length === 0 || recordBatch.isPending}
        className="w-full"
        size="lg"
        data-testid="btn-record-recitation"
      >
        {recordBatch.isPending
          ? t("recite.submitting")
          : resolvedPages.length > 0
          ? t("recite.submitN", { count: resolvedPages.length })
          : t("recite.submit")}
      </Button>
    </div>
  );
}
