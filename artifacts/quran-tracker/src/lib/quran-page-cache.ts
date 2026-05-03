// Persistent local cache for Quran page text.
//
// The Quran's text is immutable, so once we have fetched a page from
// alquran.cloud we can store it forever in IndexedDB and serve subsequent
// requests instantly. The remote API is kept only as a fallback for pages
// that have not yet been cached.
//
// Bump CACHE_VERSION whenever the post-processing of ayahs changes
// (e.g. Basmala stripping rules) so old cached entries are ignored.

import { get, set, keys, del } from "idb-keyval";
import type { ApiAyah } from "@/hooks/use-page-ayahs";

const CACHE_VERSION = 1;
const KEY_PREFIX = `quran-page-v${CACHE_VERSION}:`;

function key(pageNumber: number): string {
  return `${KEY_PREFIX}${pageNumber}`;
}

export async function getCachedPage(pageNumber: number): Promise<ApiAyah[] | null> {
  try {
    const v = await get<ApiAyah[]>(key(pageNumber));
    return v ?? null;
  } catch {
    return null;
  }
}

export async function setCachedPage(pageNumber: number, ayahs: ApiAyah[]): Promise<void> {
  try {
    await set(key(pageNumber), ayahs);
  } catch {
    // Quota / private-mode failures are non-fatal — the in-memory react-query
    // cache still works for the rest of the session.
  }
}

// Drop entries from older cache versions so storage doesn't grow unbounded
// across schema bumps.
export async function purgeStaleCacheVersions(): Promise<void> {
  try {
    const all = await keys();
    await Promise.all(
      all
        .filter(
          (k) =>
            typeof k === "string" &&
            k.startsWith("quran-page-v") &&
            !k.startsWith(KEY_PREFIX),
        )
        .map((k) => del(k)),
    );
  } catch {
    // ignore
  }
}
