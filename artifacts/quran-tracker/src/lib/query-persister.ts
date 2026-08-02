/**
 * localStorage persister for the React Query cache.
 *
 * The cache is persisted so that returning to a backgrounded (and therefore
 * unloaded) mobile tab shows the user's data immediately instead of a blank
 * screen while the network round-trips.
 *
 * Two hard-won details are encoded here:
 *
 * 1. SAFE WRITES. localStorage is capped (~5 MB) and throws
 *    QuotaExceededError when full. An unhandled throw mid-write can leave a
 *    truncated entry behind, and a truncated entry fails to rehydrate on the
 *    next load — producing a blank app that a refresh cannot fix, because
 *    the bad entry is still sitting in storage. The wrapper below therefore
 *    catches write failures and self-heals by dropping the entry entirely:
 *    losing the cache is recoverable (we refetch), a corrupt cache is not.
 *
 * 2. BOUNDED CONTENT. Quran page text is excluded — it already has its own
 *    IndexedDB layer, and 604 pages of it would blow the quota on its own.
 *    Errored and dataless queries are excluded too: persisting a failure
 *    just replays that failure on the next load.
 *
 * The `v2` key suffix intentionally abandons any `v1` blob written by the
 * earlier version of this code, which could have been clobbered to an empty
 * cache by the cache-clearing bug in App.tsx.
 */
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

/**
 * Structural subset of a React Query `Query`. Declared locally rather than
 * imported so this predicate stays assignable even if the persist packages
 * and react-query ever resolve to different query-core builds (their
 * `Query` classes carry private fields and are then treated as unrelated).
 */
interface PersistableQuery {
  queryKey: readonly unknown[];
  state: { status: string; data: unknown };
}

export const PERSIST_KEY = "qurantracker.querycache.v2";

/** Legacy keys removed on boot so they cannot keep failing to rehydrate. */
const LEGACY_KEYS = ["qurantracker.querycache.v1"];

/**
 * localStorage wrapper that can never throw out of a persist attempt.
 * On a failed write we remove the key so the next load starts from a clean
 * (empty) state rather than a half-written one.
 */
const safeStorage: Storage = {
  get length() {
    try {
      return window.localStorage.length;
    } catch {
      return 0;
    }
  },
  clear() {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  },
  key(index: number) {
    try {
      return window.localStorage.key(index);
    } catch {
      return null;
    }
  },
  getItem(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Quota exceeded or storage unavailable. Drop the entry so a partial
      // or stale blob can't poison the next rehydrate.
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  },
  removeItem(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

/** Remove caches written by older versions of the persistence scheme. */
export function purgeLegacyPersistedCaches(): void {
  for (const key of LEGACY_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

/** Drop the persisted cache entirely (used when the user identity changes). */
export function removePersistedCache(): void {
  try {
    window.localStorage.removeItem(PERSIST_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Decide whether a query belongs in the persisted snapshot.
 * Exported so the rule is testable and documented in one place.
 */
export function shouldPersistQuery(query: PersistableQuery): boolean {
  // Quran page text: already in IndexedDB, far too large for localStorage.
  if (query.queryKey[0] === "alquran-cloud-page") return false;
  // Never persist failures — they'd be restored and shown as broken state.
  if (query.state.status !== "success") return false;
  // Nothing useful to restore.
  if (query.state.data === undefined) return false;
  return true;
}

export const persister = createSyncStoragePersister({
  storage: safeStorage,
  key: PERSIST_KEY,
  // Debounce writes so a burst of mutations doesn't hammer storage.
  throttleTime: 1000,
});
