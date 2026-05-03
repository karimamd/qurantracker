import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { purgeStaleCacheVersions } from "./lib/quran-page-cache";
import { purgeStaleTafsirVersions } from "./lib/tafsir";
import { purgeStaleWbwVersions } from "./lib/wbw";

// Fire-and-forget IDB cleanup of any keys left behind by older
// CACHE_VERSION values for the bundled-Quran-content caches (page
// text, tafsir, word-by-word). Runs once per page load. Failures are
// non-fatal — the loaders themselves tolerate missing/old entries.
void purgeStaleCacheVersions();
void purgeStaleTafsirVersions();
void purgeStaleWbwVersions();

createRoot(document.getElementById("root")!).render(<App />);
