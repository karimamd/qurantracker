---
name: Arabic per-word (WBW) gloss dataset
description: Why the Ayah view falls back to English word glosses in Arabic UI mode — no complete Arabic-to-Arabic per-word dataset exists.
---

# Arabic per-word gloss: use English fallback

No complete, freely-bundleable Arabic-to-Arabic per-word (word-by-word) meaning dataset exists. The Ayah view (`ayah-detail.tsx`) therefore renders the English gloss (`w.en`) in ALL UI languages, including Arabic.

**Why:** Exhaustive search of the realistic sources came up empty for a full per-word Arabic meaning gloss:
- quran.com API v4 WBW covers en/ur/id/bn/tr/fa/hi/ta but NOT Arabic; requesting `word_translation_language=ar` still returns English text.
- quranwbw.com API blocks programmatic access (returns a "you have been blocked" error), so it can't be relied on at runtime.
- QUL / Tarteel (largest official library, downloadable JSON/sqlite) has ~16 word-by-word translation sets — all the same non-Arabic languages.
- alquran.cloud editions tagged "ar" are full ayahs in English, not per-word.
- Arabic word-level resources (غريب القرآن) only cover rare/difficult words, not every word. corpus.quran.com is grammatical morphology, not plain meanings. Abdallah-Mekky/Quran-Database & rn0x/Quran-Data have معاني الآيات / إعراب at the AYAH level, not per word.

**How to apply:** If asked again to add Arabic per-word meanings, don't re-run the whole search — it's been done. The gap is real. Either accept the English fallback, or the only real path is bundling غريب القرؤن (partial coverage) or building a custom dataset. The app already bundles a static `public/wbw.json` at build time (see `scripts/src/build-wbw-dump.ts`), so any new dataset should follow that same bundle-at-build pattern rather than a runtime API.
