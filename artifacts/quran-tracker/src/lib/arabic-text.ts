/**
 * Arabic text normalisation helpers shared across the Reader, the
 * single-ayah view, and the Ayahs search index.
 *
 * `stripTashkeel` removes the combining harakat / shadda / sukun marks
 * plus tatweel and bidi controls, then folds the alef-wasla (ٱ) to a
 * plain alef. The output is suitable as a search-key: a user typing
 * "الرحمن" or "الرحمٰن" both match an ayah whose source is
 * "ٱلرَّحْمَٰنِ".
 *
 * Keep this list in sync with the Basmala-stripping logic in
 * use-page-ayahs.ts — both rely on the same normalisation to reliably
 * locate the leading Basmala on the first ayah of a surah.
 */
export const TASHKEEL_AND_INVISIBLES =
  /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\uFEFF\u200B-\u200F\u202A-\u202E]/g;

export function stripTashkeel(s: string): string {
  return s.replace(TASHKEEL_AND_INVISIBLES, "").replace(/ٱ/g, "ا");
}

/**
 * Normalise a search query the same way ayah text is indexed: strip
 * tashkeel + invisibles, fold alef-wasla, and collapse whitespace. We
 * intentionally do NOT lowercase — Arabic has no case, and the rest of
 * the app uses the raw query elsewhere.
 */
export function normaliseSearchQuery(q: string): string {
  return stripTashkeel(q).replace(/\s+/g, " ").trim();
}
