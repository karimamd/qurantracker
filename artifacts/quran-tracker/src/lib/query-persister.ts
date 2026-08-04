/**
 * localStorage persister for the React Query cache.
 *
 * The cache is persisted so that returning to a backgrounded (and therefore
 * unloaded) mobile tab shows the user's data immediately instead of a blank
 * screen while the network round-trips.
 *
 * IDENTITY NAMESPACING
 * --------------------
 * The persist key includes the signed-in identity
 * (`qurantracker.querycache.v3.<identity>`), and App.tsx remounts the
 * PersistQueryClientProvider per identity. This replaces the older design
 * that kept ONE shared cache and cleared it whenever the identity changed.
 *
 * Why: a Clerk session expiring on a parked phone makes the settled
 * identity flip from `user_x` to `anon`/`guest` — the *same person*, just
 * unauthenticated for the moment. Clearing on that transition destroyed the
 * very data they expected back after signing in again, and guest-shaped
 * responses then overwrote the persisted cache. With namespacing:
 *   - session expiry keeps the user's cache untouched on disk; signing back
 *     in restores it instantly;
 *   - a guest or a different account simply mounts a different namespace and
 *     can never read the previous user's data — no clearing needed;
 *   - explicit sign-out still removes the user's namespace (privacy on
 *     shared devices), handled by the sign-out button in layout.tsx.
 *
 * SAFE WRITES
 * -----------
 * localStorage is capped (~5 MB) and throws QuotaExceededError when full.
 * An unhandled throw mid-write can leave a truncated entry behind, and a
 * truncated entry fails to rehydrate on the next load. The wrapper below
 * catches write failures and self-heals by dropping the entry entirely:
 * losing the cache is recoverable (we refetch), a corrupt cache is not.
 *
 * Quran page text is excluded from persistence — it already has its own
 * IndexedDB layer and 604 pages of it would blow the quota on its own.
 *
 * The `v3` base intentionally abandons both the pre-persistence `v1` blob
 * (which could have been clobbered to an empty cache by the old
 * clear-on-every-load bug) and the shared, un-namespaced `v2` blob (which
 * could hold guest-shaped empty data written during a dead-session window).
 */
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

const BASE_KEY = "qurantracker.querycache.v3";

/** Legacy keys removed on boot so they cannot keep failing to rehydrate. */
const LEGACY_KEYS = [
  "qurantracker.querycache.v1",
  "qurantracker.querycache.v2",
  // NOTE: "qurantracker.lastIdentity" is deliberately NOT purged — it is
  // live again as the explicit-sign-out cleanup hint in App.tsx.
];

export function persistKeyFor(identity: string): string {
  return `${BASE_KEY}.${identity}`;
}

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

/**
 * Drop one identity's persisted cache (used on explicit sign-out so the
 * next person on a shared device can't restore it).
 */
export function removePersistedCache(identity: string): void {
  try {
    window.localStorage.removeItem(persistKeyFor(identity));
  } catch {
    /* ignore */
  }
}

/**
 * Decide whether a query belongs in the persisted snapshot.
 * Exported so the rule is testable and documented in one place.
 *
 * Structural subset of a React Query `Query`, declared locally rather than
 * imported so this predicate stays assignable even if the persist packages
 * and react-query ever resolve to different query-core builds (their
 * `Query` classes carry private fields and are then treated as unrelated).
 */
interface PersistableQuery {
  queryKey: readonly unknown[];
  state: { status: string; data: unknown };
}

export function shouldPersistQuery(query: PersistableQuery): boolean {
  // Quran page text: already in IndexedDB, far too large for localStorage.
  if (query.queryKey[0] === "alquran-cloud-page") return false;
  // Never persist failures — they'd be restored and shown as broken state.
  if (query.state.status !== "success") return false;
  // Nothing useful to restore.
  if (query.state.data === undefined) return false;
  return true;
}

/**
 * Build the persister for one identity. A new instance per identity keeps
 * reads/writes scoped to that identity's storage key.
 */
export function createIdentityPersister(identity: string) {
  return createSyncStoragePersister({
    storage: safeStorage,
    key: persistKeyFor(identity),
    // Debounce writes so a burst of mutations doesn't hammer storage.
    throttleTime: 1000,
  });
}
