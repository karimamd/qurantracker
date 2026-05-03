/**
 * Regenerate the bundled word-by-word dump shipped at
 * `artifacts/quran-tracker/public/wbw.json`.
 *
 * Source: quran.com API v4 (https://api.quran.com), which exposes the
 * Tanzil-derived word morphology with per-word Arabic Uthmani text and
 * an English gloss. The English glosses are sourced from the project's
 * standard word-translation dataset and are widely used across mainstream
 * Quran apps.
 *
 * Bundling the full dump (~5–10 MB JSON) keeps the Ayah view fully
 * offline-capable, mirroring the same offline-first principle as
 * `build-quran-dump.ts` and `build-tafsir-dump.ts`.
 *
 * Run from repo root:
 *   pnpm --filter @workspace/scripts run build-wbw-dump
 *
 * Bump `DUMP_VERSION` whenever the dump shape changes so the runtime
 * cache layer can invalidate stale entries.
 */
import { writeFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DUMP_VERSION = 1;
const SOURCE_BASE = "https://api.quran.com/api/v4";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(
  __dirname,
  "../../artifacts/quran-tracker/public/wbw.json",
);

interface RemoteWord {
  position: number;
  text_uthmani?: string;
  text?: string;
  translation?: { text: string };
  transliteration?: { text: string };
  char_type_name?: string; // "word" or "end" (ayah marker)
}
interface RemoteVerse {
  id: number; // global ayah number 1..6236
  verse_key: string;
  words: RemoteWord[];
}
interface RemoteResponse {
  verses: RemoteVerse[];
  pagination: {
    per_page: number;
    current_page: number;
    next_page: number | null;
    total_pages: number;
    total_records: number;
  };
}

interface DumpWord {
  /** Arabic Uthmani text for this word. */
  ar: string;
  /** English gloss; empty string if missing on source. */
  en: string;
  /** Latin transliteration; empty string if missing on source. */
  tr: string;
}

interface Dump {
  version: number;
  edition: string;
  source: string;
  /** globalAyahNumber -> ordered list of words (excluding the end-of-ayah glyph). */
  ayahs: Record<number, DumpWord[]>;
}

async function fetchChapter(chapter: number): Promise<RemoteVerse[]> {
  const out: RemoteVerse[] = [];
  let page = 1;
  for (;;) {
    const url =
      `${SOURCE_BASE}/verses/by_chapter/${chapter}` +
      `?language=en&words=true&per_page=50&page=${page}` +
      `&word_fields=text_uthmani` +
      `&word_translation_language=en`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for chapter ${chapter} page ${page}`);
    }
    const json = (await res.json()) as RemoteResponse;
    out.push(...json.verses);
    if (!json.pagination.next_page) break;
    page = json.pagination.next_page;
  }
  return out;
}

async function main(): Promise<void> {
  const ayahs: Record<number, DumpWord[]> = {};
  for (let chapter = 1; chapter <= 114; chapter++) {
    process.stdout.write(`\rFetching chapter ${chapter}/114 ...`);
    const verses = await fetchChapter(chapter);
    for (const v of verses) {
      const words: DumpWord[] = [];
      for (const w of v.words) {
        // The last "word" entry per verse is an end-of-ayah glyph (the
        // ayah-number ornament), not a real word. Skip it.
        if (w.char_type_name && w.char_type_name !== "word") continue;
        const ar = w.text_uthmani ?? w.text ?? "";
        const en = w.translation?.text ?? "";
        const tr = w.transliteration?.text ?? "";
        if (!ar) continue;
        words.push({ ar, en, tr });
      }
      ayahs[v.id] = words;
    }
  }
  process.stdout.write("\n");

  const count = Object.keys(ayahs).length;
  if (count !== 6236) {
    throw new Error(`Expected 6236 ayahs, got ${count}`);
  }

  const dump: Dump = {
    version: DUMP_VERSION,
    edition: "quran.com-wbw-en",
    source: SOURCE_BASE,
    ayahs,
  };
  await writeFile(OUTPUT, JSON.stringify(dump));
  const sz = (await stat(OUTPUT)).size;
  console.log(
    `Wrote ${OUTPUT} (${(sz / 1024).toFixed(0)} KB, ${count} ayahs)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
