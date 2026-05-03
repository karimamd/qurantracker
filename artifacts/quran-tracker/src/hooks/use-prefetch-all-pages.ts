import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  pageAyahsQueryKey,
  type ApiAyah,
} from "@/hooks/use-page-ayahs";
import { getCachedPage, setCachedPage } from "@/lib/quran-page-cache";
import { getDump } from "@/lib/quran-dump";
import { TOTAL_PAGES } from "@/lib/quran-ref";

const SESSION_FLAG = "quran-prefetch-started-v2";

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

// On first mount per session, warm the IndexedDB cache from the bundled
// Quran dump (a single same-origin JSON request) so subsequent reader
// navigation is fully offline-instant. If the dump fails to load we
// silently bail — the per-page hook will fall back to the remote API
// the next time a page is requested.
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

    const run = async (): Promise<void> => {
      const dump = await getDump();
      if (cancelled || !dump) return;

      // Seed each page into IndexedDB and React Query in idle chunks so we
      // don't block the main thread on a 600+ entry write loop.
      const CHUNK = 30;
      for (let start = 1; start <= TOTAL_PAGES; start += CHUNK) {
        if (cancelled) return;
        const end = Math.min(start + CHUNK - 1, TOTAL_PAGES);
        for (let page = start; page <= end; page++) {
          const ayahs = dump.pages[String(page)];
          if (!ayahs) continue;
          // Avoid clobbering richer cached entries (e.g. ones already
          // fetched & post-processed during this session).
          const existing = await getCachedPage(page);
          if (!existing) void setCachedPage(page, ayahs);
          qc.setQueryData<ApiAyah[]>(pageAyahsQueryKey(page), prev => prev ?? ayahs);
        }
        await new Promise<void>(resolve => {
          scheduleIdle(resolve, 50);
        });
      }
    };

    scheduleIdle(() => {
      void run();
    }, 1500);

    return () => {
      cancelled = true;
    };
  }, [qc]);
}
