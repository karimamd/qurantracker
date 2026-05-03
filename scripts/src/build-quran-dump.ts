/**
 * Regenerate the bundled Quran text dump shipped at
 * `artifacts/quran-tracker/public/quran-dump.json`.
 *
 * The Quran tracker prefers this local dump over hitting alquran.cloud at
 * runtime, so the app works for self-hosters without depending on any
 * external API. The remote API is only used as a last-resort fallback.
 *
 * Run from repo root:
 *   pnpm --filter @workspace/scripts run build-quran-dump
 *
 * Bump `DUMP_VERSION` whenever the dump shape changes so the runtime
 * cache layer can invalidate stale entries.
 */
import { writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const DUMP_VERSION = 1;
const SOURCE = "https://api.alquran.cloud/v1/quran/quran-uthmani";
const OUTPUT = resolve(
  process.cwd(),
  "artifacts/quran-tracker/public/quran-dump.json",
);

interface RemoteAyah {
  number: number;
  text: string;
  numberInSurah: number;
  page: number;
}
interface RemoteSurah {
  number: number;
  englishName: string;
  englishNameTranslation: string;
  ayahs: RemoteAyah[];
}
interface RemoteResponse {
  code: number;
  status: string;
  data: { surahs: RemoteSurah[] };
}

interface DumpAyah {
  number: number;
  text: string;
  numberInSurah: number;
  surah: { number: number; englishName: string; englishNameTranslation: string };
}

interface Dump {
  version: number;
  edition: string;
  source: string;
  pages: Record<number, DumpAyah[]>;
}

async function main(): Promise<void> {
  console.log(`Fetching ${SOURCE} ...`);
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as RemoteResponse;
  if (json.code !== 200 || !json.data?.surahs) {
    throw new Error(`Unexpected payload: code=${json.code} status=${json.status}`);
  }

  const pages: Record<number, DumpAyah[]> = {};
  for (const s of json.data.surahs) {
    for (const a of s.ayahs) {
      const arr = pages[a.page] ?? (pages[a.page] = []);
      arr.push({
        number: a.number,
        text: a.text,
        numberInSurah: a.numberInSurah,
        surah: {
          number: s.number,
          englishName: s.englishName,
          englishNameTranslation: s.englishNameTranslation,
        },
      });
    }
  }
  for (const k of Object.keys(pages)) {
    pages[Number(k)].sort((a, b) => a.number - b.number);
  }

  const dump: Dump = {
    version: DUMP_VERSION,
    edition: "quran-uthmani",
    source: SOURCE,
    pages,
  };
  await writeFile(OUTPUT, JSON.stringify(dump));
  const sz = (await stat(OUTPUT)).size;
  console.log(
    `Wrote ${OUTPUT} (${(sz / 1024).toFixed(0)} KB, ${Object.keys(pages).length} pages)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
