/**
 * Flat ayah index — derived once (lazily, then memoised) from the bundled
 * `quran-dump.json`. Powers the /ayahs list and detail screens, both of
 * which work entirely client-side from this single dataset.
 *
 * Each entry carries the diacritic-stripped text alongside the original
 * so callers can do diacritic-insensitive substring search without
 * re-running the normalisation on every keystroke.
 */
import { getDump, resetDumpCache } from "@/lib/quran-dump";
import { stripTashkeel } from "@/lib/arabic-text";
import { JUZ_RANGES } from "@/lib/quran-ref";
import { stripBasmalaFromFirstAyah, type ApiAyah } from "@/hooks/use-page-ayahs";

export interface AyahIndexEntry {
  /** Global ayah number, 1..6236. */
  globalAyahNumber: number;
  /** Original Uthmani text from the dump (still includes Basmala on a surah's first ayah). */
  text: string;
  /** Diacritic-stripped + alef-wasla-folded copy used for search matching. */
  searchText: string;
  numberInSurah: number;
  surahNumber: number;
  surahName: string;
  pageNumber: number;
  juzNumber: number;
}

let indexPromise: Promise<AyahIndexEntry[]> | null = null;

/**
 * Drop the memoised promise so the next `getAyahIndex()` call retries.
 * The list/detail screens call this on failure paths so a transient
 * dump-fetch error doesn't poison the rest of the SPA session.
 */
export function resetAyahIndex(): void {
  indexPromise = null;
  // Also drop the underlying dump cache so a transient fetch failure
  // doesn't keep returning the cached null on retry.
  resetDumpCache();
}

function juzForPage(pageNumber: number): number {
  for (const j of JUZ_RANGES) {
    if (pageNumber >= j.startPage && pageNumber <= j.endPage) return j.juz;
  }
  return 1;
}

async function buildIndex(): Promise<AyahIndexEntry[]> {
  const dump = await getDump();
  if (!dump) {
    // Surface as a real failure so callers can show an error state
    // instead of an empty list, and so resetAyahIndex() can be used to
    // retry without restarting the SPA.
    throw new Error("quran-dump.json failed to load");
  }
  const entries: AyahIndexEntry[] = [];
  for (const [pageStr, ayahs] of Object.entries(dump.pages)) {
    const pageNumber = parseInt(pageStr, 10);
    if (!Number.isFinite(pageNumber)) continue;
    const juzNumber = juzForPage(pageNumber);
    // Apply the same Basmala-stripping that the Reader applies to its
    // page-level fetches, so the text shown on /ayahs/:n is byte-for-byte
    // identical to what the Reader displays for the same global ayah.
    // Without this, the dump's "بِسْمِ ... الٓمٓ" prefix on the first ayah
    // of most surahs would surface in the Ayahs view but not the Reader.
    const normalised = stripBasmalaFromFirstAyah(ayahs as ApiAyah[]);
    for (const a of normalised) {
      entries.push({
        globalAyahNumber: a.number,
        text: a.text,
        searchText: stripTashkeel(a.text),
        numberInSurah: a.numberInSurah,
        surahNumber: a.surah.number,
        surahName: a.surah.englishName,
        pageNumber,
        juzNumber,
      });
    }
  }
  // Stable order by global ayah number so prev/next nav and pagination
  // are deterministic across page-key iteration order.
  entries.sort((a, b) => a.globalAyahNumber - b.globalAyahNumber);
  return entries;
}

export function getAyahIndex(): Promise<AyahIndexEntry[]> {
  if (!indexPromise) {
    indexPromise = buildIndex().catch((err) => {
      // Clear the cached rejection so the next caller can retry, then
      // re-throw so the active caller sees the failure.
      indexPromise = null;
      throw err;
    });
  }
  return indexPromise;
}
