/**
 * Shared helpers for the memorization-progress domain.
 *
 * Exported helpers used across routes/progress.ts, routes/homework.ts and
 * routes/settings.ts:
 *   - getSettings(userId)        → lazy upsert of the user's settings row
 *   - ensurePageExists(u, page)  → lazy upsert of a page_progress row
 *   - calculateDueDate(...)      → applies the user's per-quality day buffer
 *   - enrichPageProgress(row)    → augments a DB row with derived status,
 *                                  effectiveQuality (overdue downgrade),
 *                                  daysSinceRecited / daysUntilDue, etc.
 *   - aggregateQuality(pages)    → average quality across a Rub'/Juz/Surah
 *                                  using the canonical mistakes mapping
 *   - getDefaultPageName(page)   → first-ayah snippet for a Mushaf page
 *
 * The "effective quality" downgrade ladder is the only place spaced
 * repetition penalizes neglect: a "good" page that's 28+ days overdue is
 * surfaced as "hard" (and so on through "relearn"), without ever mutating
 * the stored quality. See computeEffectiveQuality below.
 */
import { db, settingsTable, pageProgressTable, recitationLogTable, telawaLogTable, telawaScopeLogTable } from "@workspace/db";
import { eq, and, inArray, gte, count } from "drizzle-orm";
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

/**
 * Read the user's settings, lazily creating the row on first access.
 *
 * The insert MUST tolerate a conflict. A single page load fans out to
 * several endpoints at once (telawa/today, telawa/scope/today,
 * progress-chart, telawa/homework-reading, ...) and each of them calls
 * this helper. For a brand-new user they all miss the select and race to
 * insert, but `settings_user_id_unique` only lets one win — the losers
 * used to throw a duplicate-key error and 500 the whole request, which is
 * why a first load could come back partly blank until a manual refresh.
 * Swallow the conflict and re-read the winner's row instead.
 */
export async function getSettings(userId: string) {
  const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.userId, userId));
  if (settings) return settings;

  const [created] = await db
    .insert(settingsTable)
    .values({ userId })
    .onConflictDoNothing({ target: settingsTable.userId })
    .returning();
  if (created) return created;

  // Lost the race: the concurrent insert has committed, so re-read it.
  const [existing] = await db
    .select()
    .from(settingsTable)
    .where(eq(settingsTable.userId, userId));
  if (!existing) {
    throw new Error(`Failed to create or load settings for user ${userId}`);
  }
  return existing;
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

/**
 * Combined "weekly read count" per page: how many times each page was either
 * recited (recitation_log) OR explicitly read in either Telawa track
 * (telawa_log Khatmah reads + telawa_scope_log in-scope round-robin reads)
 * within [weekStart, now]. "Either one counts" — every matching row in any of
 * the three tables adds 1. Used by the Homework weekly read goal.
 *
 * Returns a Map keyed by pageNumber; pages with no activity are absent (treat
 * as 0). Returns an empty map immediately when pageNumbers is empty.
 */
export async function getWeeklyReadCounts(
  userId: string,
  pageNumbers: number[],
  weekStart: Date,
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (pageNumbers.length === 0) return map;

  const accumulate = (rows: Array<{ pageNumber: number; c: number }>): void => {
    for (const r of rows) {
      map.set(r.pageNumber, (map.get(r.pageNumber) ?? 0) + Number(r.c));
    }
  };

  const [recRows, telawaRows, scopeRows] = await Promise.all([
    db
      .select({ pageNumber: recitationLogTable.pageNumber, c: count() })
      .from(recitationLogTable)
      .where(
        and(
          eq(recitationLogTable.userId, userId),
          inArray(recitationLogTable.pageNumber, pageNumbers),
          gte(recitationLogTable.recitedAt, weekStart),
        ),
      )
      .groupBy(recitationLogTable.pageNumber),
    db
      .select({ pageNumber: telawaLogTable.pageNumber, c: count() })
      .from(telawaLogTable)
      .where(
        and(
          eq(telawaLogTable.userId, userId),
          inArray(telawaLogTable.pageNumber, pageNumbers),
          gte(telawaLogTable.readAt, weekStart),
        ),
      )
      .groupBy(telawaLogTable.pageNumber),
    db
      .select({ pageNumber: telawaScopeLogTable.pageNumber, c: count() })
      .from(telawaScopeLogTable)
      .where(
        and(
          eq(telawaScopeLogTable.userId, userId),
          inArray(telawaScopeLogTable.pageNumber, pageNumbers),
          gte(telawaScopeLogTable.readAt, weekStart),
        ),
      )
      .groupBy(telawaScopeLogTable.pageNumber),
  ]);

  accumulate(recRows);
  accumulate(telawaRows);
  accumulate(scopeRows);
  return map;
}

/**
 * Read a page's progress row, lazily creating it on first access.
 *
 * Same concurrency hazard as getSettings: the Reader can fire several
 * per-page writes for the same page at once, and `page_progress_user_page_unique`
 * would turn the losing inserts into duplicate-key 500s. Tolerate the
 * conflict and re-read instead.
 */
export async function ensurePageExists(userId: string, pageNumber: number) {
  const [existing] = await db.select().from(pageProgressTable)
    .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.pageNumber, pageNumber)));
  if (existing) return existing;

  const [created] = await db
    .insert(pageProgressTable)
    .values({ userId, pageNumber })
    .onConflictDoNothing({
      target: [pageProgressTable.userId, pageProgressTable.pageNumber],
    })
    .returning();
  if (created) return created;

  const [raced] = await db.select().from(pageProgressTable)
    .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.pageNumber, pageNumber)));
  if (!raced) {
    throw new Error(`Failed to create or load page progress ${pageNumber} for user ${userId}`);
  }
  return raced;
}
