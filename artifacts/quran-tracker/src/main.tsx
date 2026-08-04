import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { purgeStaleCacheVersions } from "./lib/quran-page-cache";
import { purgeStaleTafsirVersions } from "./lib/tafsir";
import { purgeStaleWbwVersions } from "./lib/wbw";
import { registerSW } from "virtual:pwa-register";
import { setOfflineHandler } from "@workspace/api-client-react";
import { enqueueRequest, flushQueue } from "./lib/offline-queue";
import { queryClient } from "./lib/query-client";

// Fire-and-forget IDB cleanup of any keys left behind by older
// CACHE_VERSION values for the bundled-Quran-content caches (page
// text, tafsir, word-by-word). Runs once per page load. Failures are
// non-fatal — the loaders themselves tolerate missing/old entries.
void purgeStaleCacheVersions();
void purgeStaleTafsirVersions();
void purgeStaleWbwVersions();

// Register the Workbox service worker (auto-updates on new deploy).
// devOptions.enabled: false in vite.config.ts makes this a no-op in dev.
//
// `immediate: true` checks for a new SW on load instead of waiting for the
// browser's own schedule; we also re-check every time the app returns to
// the foreground, and reload once when a new SW takes control. Without
// this, a mobile browser that keeps the tab parked can serve a stale
// bundle indefinitely — a refresh alone may never pick up new fixes.
const updateSW = registerSW({ immediate: true });
void updateSW;

let swReloading = false;
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swReloading) return;
    swReloading = true;
    window.location.reload();
  });
}

// When the app returns to the foreground (phone unlocked, tab switched
// back): pull any waiting service-worker update and refetch every query so
// the user sees their current data, not whatever was rendered when the tab
// was parked. Paired with the persisted cache (which paints instantly),
// this makes "come back minutes later" show fresh state without a manual
// refresh.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  if (navigator.onLine) {
    // Refetch everything except the bundled Quran page text — that content
    // never changes and is already cached in IndexedDB, so revalidating it
    // on every foreground would waste mobile data.
    void queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] !== "alquran-cloud-page",
    });
  }
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.ready
      .then((registration) => registration.update())
      .catch(() => undefined);
  }
});

// Wire customFetch so offline non-GET requests are persisted to IndexedDB
// instead of surfacing as raw network errors.
setOfflineHandler((req) => {
  void enqueueRequest(req);
});

async function tryFlush() {
  const { succeeded } = await flushQueue();
  if (succeeded > 0) {
    void queryClient.invalidateQueries({});
  }
}

// When the device comes back online, replay every queued mutation in order,
// then invalidate all React Query caches so the UI refreshes from the server.
window.addEventListener("online", () => { void tryFlush(); });

// Also flush on startup in case the app loads while already online with
// items that were queued during a previous offline session.
if (navigator.onLine) { void tryFlush(); }

createRoot(document.getElementById("root")!).render(<App />);
