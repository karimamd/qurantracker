import { db, settingsTable, pageProgressTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getJuzForPage, getRob3ForPage, getSurahsForPage } from "./quran-data";
import pageNamesData from "./page-names.json" with { type: "json" };

const PAGE_NAMES = pageNamesData as Record<string, { surah: number; ayah: number; text: string }>;

export function getDefaultPageName(pageNumber: number): string {
  return PAGE_NAMES[String(pageNumber)]?.text ?? "";
}

export interface PageProgressEnriched {
  pageNumber: number;
  name: string;
  defaultName: string;
  customName: string | null;
  juzNumber: number;
  rob3Number: number;
  surahs: string;
  inScope: boolean;
  quality: string | null;
  mistakes: number | null;
  lastRecited: Date | null;
  dueDate: Date | null;
  daysSinceRecited: number | null;
  daysUntilDue: number | null;
  status: string;
  effectiveQuality: string | null;
  qualityDowngrades: number;
}

const QUALITY_LADDER = ["excellent", "good", "hard", "relearn"] as const;
const OVERDUE_DOWNGRADE_DAYS = 14;

export function computeEffectiveQuality(
  quality: string | null,
  daysOverdue: number,
): { effectiveQuality: string | null; qualityDowngrades: number } {
  if (!quality) return { effectiveQuality: quality, qualityDowngrades: 0 };
  const idx = QUALITY_LADDER.indexOf(quality as (typeof QUALITY_LADDER)[number]);
  if (idx === -1) return { effectiveQuality: quality, qualityDowngrades: 0 };
  const periods = daysOverdue > 0 ? Math.floor(daysOverdue / OVERDUE_DOWNGRADE_DAYS) : 0;
  const maxDowngrade = QUALITY_LADDER.length - 1 - idx;
  const downgrades = Math.min(periods, maxDowngrade);
  return {
    effectiveQuality: QUALITY_LADDER[idx + downgrades],
    qualityDowngrades: downgrades,
  };
}

export async function getSettings(userId: string) {
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.userId, userId));
  if (!settings) {
    const [created] = await db.insert(settingsTable).values({ userId }).returning();
    return created;
  }
  return settings;
}

export function calculateDueDate(lastRecited: Date, quality: string, settings: { excellentDays: number; goodDays: number; hardDays: number; relearnDays: number }): Date {
  const days = quality === "excellent" ? settings.excellentDays
    : quality === "good" ? settings.goodDays
    : quality === "hard" ? settings.hardDays
    : settings.relearnDays;
  const due = new Date(lastRecited);
  due.setDate(due.getDate() + days);
  return due;
}

export function enrichPageProgress(page: typeof pageProgressTable.$inferSelect): PageProgressEnriched {
  const now = new Date();
  const daysSinceRecited = page.lastRecited
    ? Math.floor((now.getTime() - page.lastRecited.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const daysUntilDue = page.dueDate
    ? Math.floor((page.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  let status: string;
  if (!page.inScope) {
    status = "out_of_scope";
  } else if (!page.lastRecited) {
    status = "not_started";
  } else if (page.dueDate && page.dueDate <= now) {
    status = "overdue";
  } else if (daysUntilDue !== null && daysUntilDue <= 3) {
    status = "due_soon";
  } else {
    status = "on_track";
  }

  const defaultName = getDefaultPageName(page.pageNumber);
  const daysOverdue =
    status === "overdue" && daysUntilDue !== null && daysUntilDue < 0
      ? -daysUntilDue
      : 0;
  const { effectiveQuality, qualityDowngrades } = computeEffectiveQuality(
    page.quality,
    daysOverdue,
  );
  return {
    pageNumber: page.pageNumber,
    name: page.customName && page.customName.length > 0 ? page.customName : defaultName,
    defaultName,
    customName: page.customName,
    juzNumber: getJuzForPage(page.pageNumber),
    rob3Number: getRob3ForPage(page.pageNumber),
    surahs: getSurahsForPage(page.pageNumber),
    inScope: page.inScope,
    quality: page.quality,
    mistakes: page.mistakes,
    lastRecited: page.lastRecited,
    dueDate: page.dueDate,
    daysSinceRecited,
    daysUntilDue,
    status,
    effectiveQuality,
    qualityDowngrades,
  };
}

// Canonical mapping between a quality and a "mistake count" used to derive an
// aggregate quality across a group of pages (Rub'/Juz/Surah).
//   Excellent ≤ 0 mistakes
//   Good      ≤ 2 mistakes
//   Hard      ≤ 6 mistakes
//   Relearn   > 6 mistakes (capped at 10)
const QUALITY_TO_MISTAKES: Record<string, number> = {
  excellent: 0,
  good: 2,
  hard: 6,
  relearn: 10,
};

export function qualityToMistakes(quality: string): number {
  return QUALITY_TO_MISTAKES[quality] ?? 0;
}

// Map an average mistake count to a quality by ceiling to the nearest threshold.
//   avg = 0      → Excellent
//   0 < avg ≤ 2  → Good
//   2 < avg ≤ 6  → Hard
//   avg > 6      → Relearn
export function mistakesToQuality(avg: number): string {
  if (avg <= 0) return "excellent";
  if (avg <= 2) return "good";
  if (avg <= 6) return "hard";
  return "relearn";
}

// Aggregate quality across a set of pages. For each in-scope page that has a
// recorded quality, use its literal `mistakes` count if set, otherwise fall
// back to the canonical mistake count for its quality. Average across those
// pages and ceil to the nearest quality threshold. Returns null if no pages
// in the group have a recorded quality.
export function aggregateQuality(
  pages: Array<{ inScope: boolean; quality: string | null; mistakes: number | null }>,
): string | null {
  const withQuality = pages.filter(p => p.inScope && p.quality);
  if (withQuality.length === 0) return null;
  const total = withQuality.reduce((sum, p) => {
    const m = p.mistakes != null ? p.mistakes : qualityToMistakes(p.quality!);
    return sum + m;
  }, 0);
  const avg = total / withQuality.length;
  return mistakesToQuality(avg);
}

export async function ensurePageExists(userId: string, pageNumber: number) {
  const [existing] = await db.select().from(pageProgressTable)
    .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.pageNumber, pageNumber)));
  if (!existing) {
    const [created] = await db.insert(pageProgressTable).values({ userId, pageNumber }).returning();
    return created;
  }
  return existing;
}
