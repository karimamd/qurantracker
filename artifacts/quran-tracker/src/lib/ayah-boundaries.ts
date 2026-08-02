/**
 * Static ayah-boundary lookups derived from the bundled Quran data.
 *
 * Each surah and each Rub' (quarter-juz, rob3) has a known first and last
 * global ayah number (1-based, 1..6236).  The homework picker uses these
 * to store accurate ayah-level boundaries alongside the page-level ceiling
 * used for the pages list.
 *
 * The JSON source (`ayah-boundaries.json`) was pre-computed from the
 * bundled `quran-dump.json` and the `rob3-boundaries.json` data; it never
 * changes at runtime.
 */
import boundariesData from "@/lib/ayah-boundaries.json";

export interface AyahRange {
  first: number;
  last: number;
}

const surahs = boundariesData.surahs as Record<string, AyahRange>;
const rob3s   = boundariesData.rob3s  as Record<string, AyahRange>;

/** Returns the global-ayah range for the given surah number (1–114), or null. */
export function surahAyahBounds(surahNumber: number): AyahRange | null {
  return surahs[String(surahNumber)] ?? null;
}

/** Returns the global-ayah range for the given Rub' / part number (1–240), or null. */
export function rob3AyahBounds(rob3Number: number): AyahRange | null {
  return rob3s[String(rob3Number)] ?? null;
}

/**
 * Returns the global-ayah range for the given Juz number (1–30), or null.
 *
 * Computed from the Rub' boundaries: each Juz contains exactly 8 consecutive
 * Rub's, so Juz N spans rob3s [(N-1)×8 + 1 … N×8].
 */
export function juzAyahBounds(juzNumber: number): AyahRange | null {
  const firstRob3 = (juzNumber - 1) * 8 + 1;
  const lastRob3 = juzNumber * 8;
  const first = rob3s[String(firstRob3)];
  const last = rob3s[String(lastRob3)];
  if (!first || !last) return null;
  return { first: first.first, last: last.last };
}
