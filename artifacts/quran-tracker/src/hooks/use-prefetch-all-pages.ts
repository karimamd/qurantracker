import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  fetchPageAyahs,
  pageAyahsQueryKey,
  type ApiAyah,
} from "@/hooks/use-page-ayahs";
import { getCachedPage } from "@/lib/quran-page-cache";
import { TOTAL_PAGES } from "@/lib/quran-ref";

const SESSION_FLAG = "quran-prefetch-started-v1";

type IdleCb = (deadline: { timeRemaining: () => number; didTimeout: boolean }) => void;
type RequestIdleCallback = (cb: IdleCb, opts?: { timeout: number }) => number;

function scheduleIdle(cb: () => void, fallbackMs = 1500): void {
  const ric = (window as unknown as { requestIdleCallback?: RequestIdleCallback })
    .requestIdleCallback;
  if (typeof ric === "function") {
    ric(() => cb(), { timeout: fallbackMs });
  } else {
    setTimeout(cb, fallbackMs);
  }
}

// On first mount per session, warm the IndexedDB cache with every Quran page
// in the background so subsequent reader navigation is fully offline-instant.
// Runs serially with idle-callback pacing to avoid hammering the remote API
// and to stay out of the way of foreground work.
export function usePrefetchAllPages(): void {
  const qc = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(SESSION_FLAG)) return;
      sessionStorage.setItem(SESSION_FLAG, "1");
    } catch {
      // sessionStorage may be unavailable; just proceed once per mount.
    }

    let cancelled = false;
    const CONCURRENCY = 2;
    const PAUSE_BETWEEN_MS = 25;

    let cursor = 1;
    const runOne = async (): Promise<void> => {
      while (!cancelled && cursor <= TOTAL_PAGES) {
        const page = cursor++;
        try {
          const cached = await getCachedPage(page);
          if (cached) {
            // Seed the in-memory cache too so React Query never refetches.
            qc.setQueryData<ApiAyah[]>(pageAyahsQueryKey(page), cached);
            continue;
          }
          const ayahs = await fetchPageAyahs(page);
          qc.setQueryData<ApiAyah[]>(pageAyahsQueryKey(page), ayahs);
        } catch {
          // Network blip — skip this page; the next session will retry.
        }
        if (cancelled) return;
        await new Promise<void>((resolve) => {
          scheduleIdle(resolve, PAUSE_BETWEEN_MS);
        });
      }
    };

    scheduleIdle(() => {
      const workers = Array.from({ length: CONCURRENCY }, () => runOne());
      void Promise.all(workers);
    }, 2000);

    return () => {
      cancelled = true;
    };
  }, [qc]);
}
