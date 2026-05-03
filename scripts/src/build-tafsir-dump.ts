/**
 * Regenerate the bundled Tafsir Muyassar dump shipped at
 * `artifacts/quran-tracker/public/tafsir-muyassar.json`.
 *
 * Tafsir al-Muyassar is the modern Arabic tafsir prepared by the King Fahd
 * Glorious Quran Printing Complex (Saudi Arabia) — concise, mainstream,
 * and freely redistributable. Bundling the full dump (~3 MB JSON) keeps
 * the Ayah view fully offline-capable, mirroring the same offline-first
 * principle as `build-quran-dump.ts`.
 *
 * Run from repo root:
 *   pnpm --filter @workspace/scripts run build-tafsir-dump
 *
 * Bump `DUMP_VERSION` whenever the dump shape changes so the runtime
 * cache layer can invalidate stale entries.
 */
import { writeFile, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const DUMP_VERSION = 1;
const SOURCE = "https://api.alquran.cloud/v1/quran/ar.muyassar";
// Resolve relative to this script so it works from any cwd (pnpm runs
// workspace scripts inside the package dir, not the repo root).
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = resolve(
  __dirname,
  "../../artifacts/quran-tracker/public/tafsir-muyassar.json",
);

interface RemoteAyah {
  number: number; // global 1..6236
  text: string;
}
interface RemoteSurah {
  ayahs: RemoteAyah[];
}
interface RemoteResponse {
  code: number;
  status: string;
  data: { surahs: RemoteSurah[] };
}

interface Dump {
  version: number;
  edition: string;
  source: string;
  /** globalAyahNumber -> tafsir text */
  ayahs: Record<number, string>;
}

async function main(): Promise<void> {
  console.log(`Fetching ${SOURCE} ...`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as RemoteResponse;
  if (json.code !== 200 || !json.data?.surahs) {
    throw new Error(`Unexpected payload: code=${json.code} status=${json.status}`);
  }

  const ayahs: Record<number, string> = {};
  for (const s of json.data.surahs) {
    for (const a of s.ayahs) {
      ayahs[a.number] = a.text;
    }
  }
  const count = Object.keys(ayahs).length;
  if (count !== 6236) {
    throw new Error(`Expected 6236 ayahs, got ${count}`);
  }

  const dump: Dump = {
    version: DUMP_VERSION,
    edition: "ar.muyassar",
    source: SOURCE,
    ayahs,
  };
  await writeFile(OUTPUT, JSON.stringify(dump));
  const sz = (await stat(OUTPUT)).size;
  console.log(
    `Wrote ${OUTPUT} (${(sz / 1024).toFixed(0)} KB, ${count} ayahs)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
