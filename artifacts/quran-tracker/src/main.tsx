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
registerSW({ onNeedRefresh() { /* auto-update takes care of it */ } });

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
