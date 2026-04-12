import { db, settingsTable, pageProgressTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getJuzForPage, getRob3ForPage, getSurahsForPage } from "./quran-data";

export interface PageProgressEnriched {
  pageNumber: number;
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
}

export async function getSettings() {
  const [settings] = await db.select().from(settingsTable);
  if (!settings) {
    const [created] = await db.insert(settingsTable).values({}).returning();
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

  return {
    pageNumber: page.pageNumber,
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
  };
}

export async function ensurePageExists(pageNumber: number) {
  const [existing] = await db.select().from(pageProgressTable).where(eq(pageProgressTable.pageNumber, pageNumber));
  if (!existing) {
    const [created] = await db.insert(pageProgressTable).values({ pageNumber }).returning();
    return created;
  }
  return existing;
}
