import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

export async function fetchPageAyahs(pageNumber: number, signal?: AbortSignal): Promise<ApiAyah[]> {
  const res = await fetch(
    `https://api.alquran.cloud/v1/page/${pageNumber}/quran-uthmani`,
    { signal },
  );
  if (!res.ok) throw new Error(`Failed to load page ${pageNumber}: ${res.status}`);
  const json = (await res.json()) as ApiPageResponse;
  if (json.code !== 200 || !json.data?.ayahs) throw new Error(`Invalid response for page ${pageNumber}`);
  return json.data.ayahs;
}

export function pageAyahsQueryKey(pageNumber: number) {
  return ["alquran-cloud-page", pageNumber] as const;
}

const PAGE_AYAH_OPTIONS = {
  staleTime: 1000 * 60 * 60,
  gcTime: 1000 * 60 * 60,
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
