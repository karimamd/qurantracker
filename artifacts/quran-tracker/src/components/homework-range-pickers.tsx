/**
 * HomeworkScopePicker — mode-tabbed scope selector for homework create/edit.
 *
 * Four modes:
 *   Juz    — pick one of 30 Juzs; tight ayah bounds + ceiling pages
 *   Surah  — pick one of 114 Surahs; tight ayah bounds + ceiling pages
 *   Part   — pick any of 240 Rub's, grouped by Juz, no surah pre-filter;
 *            tight ayah bounds + ceiling pages
 *   Pages  — free-text page range; all ayahs on those pages in scope
 *
 * The text input for Pages mode lives inside this component; the parent no
 * longer renders a separate <Input> for the page range.  The parent still
 * owns the page range string state and the ayah-boundary accumulation.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SURAHS,
  ALL_ROB3S,
  ROB3S_PER_JUZ,
  JUZ_RANGES,
  getSurahsInPageRange,
} from "@/lib/quran-ref";
import { Rob3FirstAyahPreview } from "@/components/rob3-first-ayah-preview";
import { surahAyahBounds, rob3AyahBounds, juzAyahBounds } from "@/lib/ayah-boundaries";

type PickerMode = "juz" | "surah" | "part" | "pages";

/** Format a page range label, avoiding TS2367 literal-type overlap errors. */
function pRange(start: number, end: number): string {
  return start === end ? `p. ${start}` : `p. ${start}–${end}`;
}

const MODES: { id: PickerMode; label: string }[] = [
  { id: "juz",   label: "Juz" },
  { id: "surah", label: "Surah" },
  { id: "part",  label: "Part" },
  { id: "pages", label: "Pages" },
];

export interface HomeworkScopePickerProps {
  testIdPrefix: string;
  /** Controlled page-range string (e.g. "82-101, 22-41"). */
  pageRange: string;
  /** Called when the user edits the page range in Pages mode. */
  onPageRangeChange: (value: string) => void;
  /**
   * Called when the user picks a Juz / Surah / Part.
   * Parent should append the new pages to pageRange and expand ayah bounds.
   */
  onGrainPick: (
    startPage: number,
    endPage: number,
    firstGlobalAyah?: number,
    lastGlobalAyah?: number,
  ) => void;
  /** Placeholder shown inside the Pages-mode text input. */
  pagePlaceholder?: string;
}

export function HomeworkScopePicker({
  testIdPrefix,
  pageRange,
  onPageRangeChange,
  onGrainPick,
  pagePlaceholder = "e.g. 100–105, 110",
}: HomeworkScopePickerProps) {
  const [mode, setMode] = useState<PickerMode>("surah");
  // Bump keys to reset the Select after each pick so the same item can
  // be picked twice in a row (e.g. adding a part a second time).
  const [juzKey,  setJuzKey]  = useState(0);
  const [surahKey, setSurahKey] = useState(0);
  const [partKey,  setPartKey]  = useState(0);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleJuz = (value: string) => {
    const n = parseInt(value, 10);
    const juz = JUZ_RANGES.find(j => j.juz === n);
    if (juz) {
      const bounds = juzAyahBounds(n);
      onGrainPick(juz.startPage, juz.endPage, bounds?.first, bounds?.last);
    }
    setJuzKey(k => k + 1);
  };

  const handleSurah = (value: string) => {
    const n = parseInt(value, 10);
    const s = SURAHS.find(x => x.number === n);
    if (s) {
      const bounds = surahAyahBounds(n);
      onGrainPick(s.startPage, s.endPage, bounds?.first, bounds?.last);
    }
    setSurahKey(k => k + 1);
  };

  const handlePart = (value: string) => {
    const n = parseInt(value, 10);
    const r = ALL_ROB3S.find(x => x.rob3 === n);
    if (r) {
      const bounds = rob3AyahBounds(n);
      onGrainPick(r.startPage, r.endPage, bounds?.first, bounds?.last);
    }
    setPartKey(k => k + 1);
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  // Brief surah-span description for each Juz (e.g. "Al-Fatiha – Al-Baqarah").
  const juzItems = JUZ_RANGES.map(juz => {
    const surahs = getSurahsInPageRange(juz.startPage, juz.endPage);
    const first = surahs[0];
    const last  = surahs[surahs.length - 1];
    const desc  = !first ? "" : first.number === last?.number
      ? first.name
      : `${first.name} – ${last.name}`;
    return { ...juz, desc };
  });

  // All 240 parts grouped by Juz — no surah filter.
  const partsByJuz = JUZ_RANGES.map(juz => ({
    juz:   juz.juz,
    parts: ALL_ROB3S.filter(r => r.juz === juz.juz),
  }));

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-2 mt-2" data-testid={`range-pickers-${testIdPrefix}`}>

      {/* Mode tabs */}
      <div className="flex gap-1">
        {MODES.map(m => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            data-testid={`mode-${testIdPrefix}-${m.id}`}
            className={cn(
              "px-3 py-1 text-xs font-medium rounded border transition-colors",
              mode === m.id
                ? "bg-teal-700 text-white border-teal-700"
                : "bg-background text-muted-foreground border-border hover:border-teal-500 hover:text-teal-900",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Juz picker */}
      {mode === "juz" && (
        <Select key={`juz-${juzKey}`} onValueChange={handleJuz}>
          <SelectTrigger data-testid={`select-juz-${testIdPrefix}`}>
            <SelectValue placeholder="Add Juz…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {juzItems.map(juz => (
              <SelectItem
                key={juz.juz}
                value={String(juz.juz)}
                data-testid={`opt-juz-${testIdPrefix}-${juz.juz}`}
              >
                <div className="flex flex-col items-start gap-0 py-0.5">
                  <span className="text-sm font-medium">Juz {juz.juz}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {juz.desc && `${juz.desc} · `}
                    {pRange(juz.startPage, juz.endPage)}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Surah picker */}
      {mode === "surah" && (
        <Select key={`surah-${surahKey}`} onValueChange={handleSurah}>
          <SelectTrigger data-testid={`select-surah-${testIdPrefix}`}>
            <SelectValue placeholder="Add Surah…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {SURAHS.map(s => (
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
                  <span className="text-[11px] text-muted-foreground">
                    {pRange(s.startPage, s.endPage)}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Part picker — all 240 Rub's grouped by Juz, no surah pre-filter */}
      {mode === "part" && (
        <Select key={`part-${partKey}`} onValueChange={handlePart}>
          <SelectTrigger data-testid={`select-part-${testIdPrefix}`}>
            <SelectValue placeholder="Add Part…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {partsByJuz.map(({ juz, parts }) => (
              <SelectGroup key={juz}>
                <SelectLabel>Juz {juz}</SelectLabel>
                {parts.map(r => {
                  const range = pRange(r.startPage, r.endPage);
                  const surahsSpanned = getSurahsInPageRange(r.startPage, r.endPage);
                  const surahsLabel =
                    surahsSpanned
                      .slice(0, 2)
                      .map(s => s.name)
                      .join(", ") +
                    (surahsSpanned.length > 2 ? ` +${surahsSpanned.length - 2}` : "");
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
                        {surahsLabel && (
                          <span className="text-[11px] text-muted-foreground">{surahsLabel}</span>
                        )}
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
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Pages mode — free-text input */}
      {mode === "pages" && (
        <Input
          value={pageRange}
          onChange={e => onPageRangeChange(e.target.value)}
          placeholder={pagePlaceholder}
          data-testid={`input-pages-${testIdPrefix}`}
        />
      )}

      {/* Current pages summary shown when in a grain mode */}
      {mode !== "pages" && pageRange && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            Pages:&nbsp;<span className="font-mono text-foreground">{pageRange}</span>
          </span>
          <button
            type="button"
            onClick={() => onPageRangeChange("")}
            className="text-teal-700 hover:text-teal-800 underline shrink-0"
            data-testid={`clear-pages-${testIdPrefix}`}
          >
            clear
          </button>
        </div>
      )}
    </div>
  );
}

// ── Legacy alias ──────────────────────────────────────────────────────────────
// Keep the old export name so any test-ids or external references still resolve.
export const HomeworkRangePickers = HomeworkScopePicker;
export type HomeworkRangePickersProps = HomeworkScopePickerProps;
