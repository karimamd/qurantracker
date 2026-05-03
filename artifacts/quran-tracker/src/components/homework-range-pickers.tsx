import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SURAHS, ALL_ROB3S, ROB3S_PER_JUZ, JUZ_RANGES, getSurahsInPageRange } from "@/lib/quran-ref";
import { Rob3FirstAyahPreview } from "@/components/rob3-first-ayah-preview";

/**
 * Surah / Part picker pair shared by the Create and Edit homework dialogs.
 * Picking either one calls `onPick(startPage, endPage)` so the parent can
 * append to its free-text page-range input. Internal `key` bumps reset the
 * Select so the same option can be picked twice in a row.
 */
export interface HomeworkRangePickersProps {
  testIdPrefix: string;
  onPick: (startPage: number, endPage: number) => void;
}

export function HomeworkRangePickers({ testIdPrefix, onPick }: HomeworkRangePickersProps) {
  const [surahKey, setSurahKey] = useState(0);
  const [partKey, setPartKey] = useState(0);
  const [filterSurah, setFilterSurah] = useState<number | null>(null);

  const handleSurah = (value: string) => {
    const n = parseInt(value, 10);
    const s = SURAHS.find(x => x.number === n);
    if (s) {
      onPick(s.startPage, s.endPage);
      setFilterSurah(n);
    }
    setSurahKey(k => k + 1);
  };

  const handlePart = (value: string) => {
    const n = parseInt(value, 10);
    const r = ALL_ROB3S.find(x => x.rob3 === n);
    if (r) onPick(r.startPage, r.endPage);
    setPartKey(k => k + 1);
  };

  const filterSurahData = filterSurah !== null
    ? SURAHS.find(s => s.number === filterSurah) ?? null
    : null;

  const visibleParts = filterSurahData
    ? ALL_ROB3S.filter(
        r => r.startPage <= filterSurahData.endPage && r.endPage >= filterSurahData.startPage,
      )
    : ALL_ROB3S;

  const partsByJuz = JUZ_RANGES.map(juz => ({
    juz: juz.juz,
    parts: visibleParts.filter(r => r.juz === juz.juz),
  })).filter(g => g.parts.length > 0);

  const partPlaceholder = filterSurahData ? `Part of ${filterSurahData.name}…` : "Add Part…";

  return (
    <div className="space-y-2 mt-2" data-testid={`range-pickers-${testIdPrefix}`}>
      <div className="grid grid-cols-2 gap-2">
        <Select key={`surah-${surahKey}`} onValueChange={handleSurah}>
          <SelectTrigger data-testid={`select-surah-${testIdPrefix}`}>
            <SelectValue placeholder="Add Surah…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {SURAHS.map(s => {
              const range = s.startPage === s.endPage ? `p. ${s.startPage}` : `p. ${s.startPage}–${s.endPage}`;
              return (
                <SelectItem
                  key={s.number}
                  value={String(s.number)}
                  data-testid={`opt-surah-${testIdPrefix}-${s.number}`}
                >
                  <div className="flex flex-col items-start gap-0 py-0.5">
                    <span className="text-sm">
                      {s.number}. {s.name}
                      <span className="ml-2 text-muted-foreground" dir="rtl">{s.arabic}</span>
                    </span>
                    <span className="text-[11px] text-muted-foreground">{range}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <Select key={`part-${partKey}`} onValueChange={handlePart}>
          <SelectTrigger data-testid={`select-part-${testIdPrefix}`}>
            <SelectValue placeholder={partPlaceholder} />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {partsByJuz.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground">
                No Parts overlap the selected Surah.
              </div>
            ) : (
              partsByJuz.map(({ juz, parts }) => (
                <SelectGroup key={juz}>
                  <SelectLabel>Juz {juz}</SelectLabel>
                  {parts.map(r => {
                    const range = r.startPage === r.endPage ? `p. ${r.startPage}` : `p. ${r.startPage}–${r.endPage}`;
                    const surahsSpanned = getSurahsInPageRange(r.startPage, r.endPage);
                    const surahsLabel = surahsSpanned
                      .map(s => s.name)
                      .slice(0, 2)
                      .join(", ") + (surahsSpanned.length > 2 ? ` +${surahsSpanned.length - 2}` : "");
                    const startSurah = SURAHS.find(s => s.number === r.startSurah);
                    return (
                      <SelectItem
                        key={r.rob3}
                        value={String(r.rob3)}
                        data-testid={`opt-part-${testIdPrefix}-${r.rob3}`}
                      >
                        <div className="flex flex-col items-start gap-0.5 py-0.5 max-w-[280px]">
                          <span className="text-sm">
                            Part {r.rob3InJuz + 1}/{ROB3S_PER_JUZ}
                            <span className="ml-2 text-muted-foreground">· {range}</span>
                          </span>
                          {surahsLabel ? (
                            <span className="text-[11px] text-muted-foreground">{surahsLabel}</span>
                          ) : null}
                          {startSurah ? (
                            <span className="text-[11px] text-muted-foreground">
                              starts at {startSurah.name} {r.startAyah} (p.{r.startPage})
                            </span>
                          ) : null}
                          <Rob3FirstAyahPreview
                            rob3Number={r.rob3}
                            className="block text-[12px] mt-0.5 max-w-full"
                            wordCount={6}
                          />
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {filterSurahData ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Showing Parts in <span className="font-medium text-foreground">{filterSurahData.name}</span>
          </span>
          <button
            type="button"
            onClick={() => setFilterSurah(null)}
            className="text-teal-700 hover:text-teal-800 underline"
            data-testid={`clear-surah-filter-${testIdPrefix}`}
          >
            Show all Parts
          </button>
        </div>
      ) : null}
    </div>
  );
}
