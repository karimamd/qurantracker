import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCachedPage, setCachedPage } from "@/lib/quran-page-cache";
import { getPageFromDump } from "@/lib/quran-dump";

export interface ApiAyah {
  number: number;
  text: string;
  numberInSurah: number;
  surah: { number: number; englishName: string; englishNameTranslation: string };
}

interface ApiPageResponse {
  code: number;
  status: string;
  data: { number: number; ayahs: ApiAyah[] };
}

// The alquran.cloud Uthmani edition prefixes the Basmala onto the text of
// the first ayah of every surah except Al-Fatiha (where Basmala IS ayah 1)
// and At-Tawbah (which has no Basmala). Strip it so the displayed ayah
// matches the standard Mushaf — the Basmala header is shown separately by
// the reader UI.
//
// Matching is done on a tashkeel-stripped copy because the source text uses
// inconsistent combining-mark order (e.g. shadda before vs after fatha) that
// makes a literal regex brittle.
const TASHKEEL_AND_INVISIBLES =
  /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\uFEFF\u200B-\u200F\u202A-\u202E]/g;

const BASMALA_BARE = "بسم الله الرحمن الرحيم";

function stripTashkeel(s: string): string {
  return s.replace(TASHKEEL_AND_INVISIBLES, "").replace(/ٱ/g, "ا");
}

function stripBasmalaFromFirstAyah(ayahs: ApiAyah[]): ApiAyah[] {
  return ayahs.map(a => {
    if (a.numberInSurah !== 1) return a;
    if (a.surah.number === 1 || a.surah.number === 9) return a;

    // Walk the original text and find how many original characters correspond
    // to the bare-Basmala prefix plus a trailing space.
    const original = a.text;
    let i = 0;
    let bareIdx = 0;
    // Skip a leading BOM if present
    while (i < original.length && /[\uFEFF]/.test(original[i])) i++;
    while (i < original.length && bareIdx < BASMALA_BARE.length) {
      const ch = original[i];
      const stripped = stripTashkeel(ch);
      if (stripped === "") {
        i++;
        continue;
      }
      if (stripped === BASMALA_BARE[bareIdx]) {
        i++;
        bareIdx++;
        continue;
      }
      // Mismatch — not a Basmala prefix; bail out unchanged.
      return a;
    }
    if (bareIdx < BASMALA_BARE.length) return a;
    // Consume any trailing tashkeel/invisibles attached to the final consonant
    // of the Basmala (e.g. the kasra on the last mim).
    while (i < original.length && stripTashkeel(original[i]) === "") i++;
    // Consume one or more whitespace separators between Basmala and the ayah.
    while (i < original.length && /\s/.test(original[i])) i++;
    if (i >= original.length) return a;

    return { ...a, text: original.slice(i) };
  });
}

async function fetchPageAyahsFromNetwork(
  pageNumber: number,
  signal?: AbortSignal,
): Promise<ApiAyah[]> {
  const res = await fetch(
    `https://api.alquran.cloud/v1/page/${pageNumber}/quran-uthmani`,
    { signal },
  );
  if (!res.ok) throw new Error(`Failed to load page ${pageNumber}: ${res.status}`);
  const json = (await res.json()) as ApiPageResponse;
  if (json.code !== 200 || !json.data?.ayahs) throw new Error(`Invalid response for page ${pageNumber}`);
  return stripBasmalaFromFirstAyah(json.data.ayahs);
}

// Read-through fetch with a layered fallback chain:
//   1. IndexedDB (per-page cache, populated on previous successful reads)
//   2. Bundled local dump shipped at /quran-dump.json (fully offline)
//   3. Remote alquran.cloud API (last-resort backfill if the dump file
//      is missing or doesn't contain that page yet)
//
// The bundled dump means a self-hosted clone of this open-source project
// works without any external dependency; the API is genuinely just a
// safety net. Quran text is immutable, so successful results from any
// layer are persisted to IndexedDB for instant future loads.
export async function fetchPageAyahs(pageNumber: number, signal?: AbortSignal): Promise<ApiAyah[]> {
  const cached = await getCachedPage(pageNumber);
  if (cached) return cached;

  const fromDump = await getPageFromDump(pageNumber);
  if (fromDump) {
    // Local dump already had Basmala-stripping applied at generation
    // time — but the generator currently mirrors the API, so we re-run
    // the same normalisation to keep behaviour identical to the network
    // path. Cheap and idempotent.
    const normalised = stripBasmalaFromFirstAyah(fromDump);
    void setCachedPage(pageNumber, normalised);
    return normalised;
  }

  const ayahs = await fetchPageAyahsFromNetwork(pageNumber, signal);
  void setCachedPage(pageNumber, ayahs);
  return ayahs;
}

export function pageAyahsQueryKey(pageNumber: number) {
  return ["alquran-cloud-page", pageNumber] as const;
}

// Quran text never changes — keep the in-memory react-query cache forever
// so navigating between pages within a session is instant, and rely on the
// IndexedDB layer for cross-session persistence.
const PAGE_AYAH_OPTIONS = {
  staleTime: Infinity,
  gcTime: Infinity,
  retry: 1,
} as const;

export function usePageAyahs(pageNumber: number, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: pageAyahsQueryKey(pageNumber),
    queryFn: ({ signal }) => fetchPageAyahs(pageNumber, signal),
    enabled: options?.enabled ?? true,
    ...PAGE_AYAH_OPTIONS,
  });
}

export function usePrefetchPageAyahs() {
  const qc = useQueryClient();
  return useCallback(
    (pageNumber: number) => {
      void qc.prefetchQuery({
        queryKey: pageAyahsQueryKey(pageNumber),
        queryFn: ({ signal }) => fetchPageAyahs(pageNumber, signal),
        ...PAGE_AYAH_OPTIONS,
      });
    },
    [qc],
  );
}
