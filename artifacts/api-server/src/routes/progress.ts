import { Router, type IRouter } from "express";
import { db, pageProgressTable, recitationLogTable, homeworkItemsTable, homeworkSessionsTable } from "@workspace/db";
import { eq, and, inArray, desc, sql, gte } from "drizzle-orm";
import {
  GetProgressOverviewResponse,
  ListJuzProgressResponse,
  GetJuzDetailParams,
  GetJuzDetailResponse,
  ListSurahProgressResponse,
  ListPageProgressQueryParams,
  ListPageProgressResponse,
  UpdatePageProgressParams,
  UpdatePageProgressBody,
  UpdatePageProgressResponse,
  RenamePageParams,
  RenamePageBody,
  RenamePageResponse,
  RecordBatchRecitationBody,
  RecordBatchRecitationResponse,
  AddToScopeBody,
  AddToScopeResponse,
  RemoveFromScopeBody,
  RemoveFromScopeResponse,
  GetRecentActivityQueryParams,
  GetRecentActivityResponse,
  GetDailyChartQueryParams,
  GetDailyChartResponse,
  GetProgressChartQueryParams,
  GetProgressChartResponse,
  GetSurahDetailParams,
  GetSurahDetailResponse,
} from "@workspace/api-zod";
import {
  TOTAL_PAGES,
  JUZ_PAGE_RANGES,
  SURAHS,
  getJuzForPage,
  getRob3ForPage,
  getSurahsForPage,
  getJuzName,
  getRob3Range,
  ROB3S_PER_JUZ,
} from "../lib/quran-data";
import { enrichPageProgress, getSettings, calculateDueDate, ensurePageExists, getDefaultPageName } from "../lib/progress-helpers";

const router: IRouter = Router();

router.get("/progress/overview", async (_req, res): Promise<void> => {
  const allPages = await db.select().from(pageProgressTable);
  const enriched = allPages.map(enrichPageProgress);
  const inScope = enriched.filter(p => p.inScope);

  const now = new Date();
  let streakDays = 0;
  if (allPages.length > 0) {
    const logs = await db.select().from(recitationLogTable).orderBy(desc(recitationLogTable.recitedAt));
    if (logs.length > 0) {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let checkDate = new Date(today);
      for (let i = 0; i < 365; i++) {
        const dayStart = new Date(checkDate);
        const dayEnd = new Date(checkDate);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const hasLog = logs.some(l => l.recitedAt >= dayStart && l.recitedAt < dayEnd);
        if (hasLog) {
          streakDays++;
          checkDate.setDate(checkDate.getDate() - 1);
        } else if (i === 0) {
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        } else {
          break;
        }
      }
    }
  }

  const lastRecitedPage = inScope.filter(p => p.lastRecited).sort((a, b) => (b.lastRecited!.getTime() - a.lastRecited!.getTime()));
  const lastRecitedDate = lastRecitedPage.length > 0 ? lastRecitedPage[0].lastRecited : null;

  const overview = {
    totalPages: TOTAL_PAGES,
    pagesInScope: inScope.length,
    pagesOverdue: inScope.filter(p => p.status === "overdue").length,
    pagesDueSoon: inScope.filter(p => p.status === "due_soon").length,
    pagesOnTrack: inScope.filter(p => p.status === "on_track").length,
    pagesNotStarted: inScope.filter(p => p.status === "not_started").length,
    excellentCount: inScope.filter(p => p.quality === "excellent").length,
    goodCount: inScope.filter(p => p.quality === "good").length,
    hardCount: inScope.filter(p => p.quality === "hard").length,
    relearnCount: inScope.filter(p => p.quality === "relearn").length,
    lastRecitedDate,
    streakDays,
  };

  res.json(GetProgressOverviewResponse.parse(overview));
});

router.get("/progress/juz", async (_req, res): Promise<void> => {
  const allPages = await db.select().from(pageProgressTable);
  const enriched = allPages.map(enrichPageProgress);

  const juzList = JUZ_PAGE_RANGES.map(juz => {
    const juzPages = enriched.filter(p => p.juzNumber === juz.juz);
    const inScope = juzPages.filter(p => p.inScope);
    const lastRecitedArr = inScope.filter(p => p.lastRecited).sort((a, b) => b.lastRecited!.getTime() - a.lastRecited!.getTime());
    const nextDueArr = inScope.filter(p => p.dueDate).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());

    const qualities = inScope.filter(p => p.quality).map(p => p.quality!);
    const avgQuality = qualities.length > 0 ? getMostCommonQuality(qualities) : null;

    return {
      juzNumber: juz.juz,
      name: getJuzName(juz.juz),
      startPage: juz.startPage,
      endPage: juz.endPage,
      totalPages: juz.endPage - juz.startPage + 1,
      pagesInScope: inScope.length,
      pagesOverdue: inScope.filter(p => p.status === "overdue").length,
      pagesDueSoon: inScope.filter(p => p.status === "due_soon").length,
      pagesOnTrack: inScope.filter(p => p.status === "on_track").length,
      averageQuality: avgQuality,
      lastRecited: lastRecitedArr.length > 0 ? lastRecitedArr[0].lastRecited : null,
      nextDue: nextDueArr.length > 0 ? nextDueArr[0].dueDate : null,
    };
  });

  res.json(ListJuzProgressResponse.parse(juzList));
});

router.get("/progress/juz/:juzNumber", async (req, res): Promise<void> => {
  const params = GetJuzDetailParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const juz = JUZ_PAGE_RANGES.find(j => j.juz === params.data.juzNumber);
  if (!juz) {
    res.status(404).json({ error: "Juz not found" });
    return;
  }

  const allPages = await db.select().from(pageProgressTable);
  const enriched = allPages.map(enrichPageProgress);
  const juzPages = enriched.filter(p => p.juzNumber === juz.juz);

  const rob3s = [];
  for (let i = 0; i < ROB3S_PER_JUZ; i++) {
    const rob3Number = (juz.juz - 1) * ROB3S_PER_JUZ + i + 1;
    const range = getRob3Range(rob3Number);
    const rob3Pages = enriched.filter(p => p.rob3Number === rob3Number);
    const inScope = rob3Pages.filter(p => p.inScope);
    const lastRecitedArr = inScope.filter(p => p.lastRecited).sort((a, b) => b.lastRecited!.getTime() - a.lastRecited!.getTime());
    const nextDueArr = inScope.filter(p => p.dueDate).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
    const qualities = inScope.filter(p => p.quality).map(p => p.quality!);
    const totalMistakes = inScope.reduce((sum, p) => sum + (p.mistakes || 0), 0);

    rob3s.push({
      rob3Number,
      juzNumber: juz.juz,
      startPage: range.startPage,
      endPage: range.endPage,
      totalPages: range.endPage - range.startPage + 1,
      pagesInScope: inScope.length,
      pagesOverdue: inScope.filter(p => p.status === "overdue").length,
      averageQuality: qualities.length > 0 ? getMostCommonQuality(qualities) : null,
      lastRecited: lastRecitedArr.length > 0 ? lastRecitedArr[0].lastRecited : null,
      nextDue: nextDueArr.length > 0 ? nextDueArr[0].dueDate : null,
      totalMistakes: inScope.length > 0 ? totalMistakes : null,
    });
  }

  const allPagesForJuz = [];
  for (let p = juz.startPage; p <= juz.endPage; p++) {
    const existing = enriched.find(e => e.pageNumber === p);
    if (existing) {
      allPagesForJuz.push(existing);
    } else {
      allPagesForJuz.push({
        pageNumber: p,
        name: getDefaultPageName(p),
        defaultName: getDefaultPageName(p),
        customName: null,
        juzNumber: juz.juz,
        rob3Number: getRob3ForPage(p),
        surahs: getSurahsForPage(p),
        inScope: false,
        quality: null,
        mistakes: null,
        lastRecited: null,
        dueDate: null,
        daysSinceRecited: null,
        daysUntilDue: null,
        status: "out_of_scope",
      });
    }
  }

  const detail = {
    juzNumber: juz.juz,
    name: getJuzName(juz.juz),
    startPage: juz.startPage,
    endPage: juz.endPage,
    rob3s,
    pages: allPagesForJuz,
  };

  res.json(GetJuzDetailResponse.parse(detail));
});

router.get("/progress/surah", async (_req, res): Promise<void> => {
  const allPages = await db.select().from(pageProgressTable);
  const enriched = allPages.map(enrichPageProgress);

  const surahList = SURAHS.map(surah => {
    const surahPages = enriched.filter(p => p.pageNumber >= surah.startPage && p.pageNumber <= surah.endPage);
    const inScope = surahPages.filter(p => p.inScope);
    const lastRecitedArr = inScope.filter(p => p.lastRecited).sort((a, b) => b.lastRecited!.getTime() - a.lastRecited!.getTime());
    const nextDueArr = inScope.filter(p => p.dueDate).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
    const qualities = inScope.filter(p => p.quality).map(p => p.quality!);

    return {
      surahNumber: surah.number,
      name: surah.name,
      arabicName: surah.arabicName,
      startPage: surah.startPage,
      endPage: surah.endPage,
      totalPages: surah.endPage - surah.startPage + 1,
      pagesInScope: inScope.length,
      pagesOverdue: inScope.filter(p => p.status === "overdue").length,
      pagesOnTrack: inScope.filter(p => p.status === "on_track" || p.status === "due_soon").length,
      averageQuality: qualities.length > 0 ? getMostCommonQuality(qualities) : null,
      lastRecited: lastRecitedArr.length > 0 ? lastRecitedArr[0].lastRecited : null,
      nextDue: nextDueArr.length > 0 ? nextDueArr[0].dueDate : null,
    };
  });

  res.json(ListSurahProgressResponse.parse(surahList));
});

router.get("/progress/surah/:surahNumber", async (req, res): Promise<void> => {
  const params = GetSurahDetailParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const surah = SURAHS.find(s => s.number === params.data.surahNumber);
  if (!surah) {
    res.status(404).json({ error: "Surah not found" });
    return;
  }

  const allPages = await db.select().from(pageProgressTable);
  const enriched = allPages.map(enrichPageProgress);

  const pages = [];
  for (let p = surah.startPage; p <= surah.endPage; p++) {
    const existing = enriched.find(e => e.pageNumber === p);
    if (existing) {
      pages.push(existing);
    } else {
      pages.push({
        pageNumber: p,
        name: getDefaultPageName(p),
        defaultName: getDefaultPageName(p),
        customName: null,
        juzNumber: getJuzForPage(p),
        rob3Number: getRob3ForPage(p),
        surahs: getSurahsForPage(p),
        inScope: false,
        quality: null,
        mistakes: null,
        lastRecited: null,
        dueDate: null,
        daysSinceRecited: null,
        daysUntilDue: null,
        status: "out_of_scope",
      });
    }
  }

  const inScope = pages.filter(p => p.inScope);
  const detail = {
    surahNumber: surah.number,
    name: surah.name,
    arabicName: surah.arabicName,
    startPage: surah.startPage,
    endPage: surah.endPage,
    totalPages: surah.endPage - surah.startPage + 1,
    pagesInScope: inScope.length,
    pagesOverdue: inScope.filter(p => p.status === "overdue").length,
    pages,
  };

  res.json(GetSurahDetailResponse.parse(detail));
});

router.get("/progress/pages", async (req, res): Promise<void> => {
  const queryParams = ListPageProgressQueryParams.safeParse(req.query);
  const filters = queryParams.success ? queryParams.data : {};

  const allPages = await db.select().from(pageProgressTable);
  let enriched = allPages.map(enrichPageProgress);

  const allPageNumbers = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);
  const fullList = allPageNumbers.map(num => {
    const existing = enriched.find(e => e.pageNumber === num);
    if (existing) return existing;
    const defaultName = getDefaultPageName(num);
    return {
      pageNumber: num,
      name: defaultName,
      defaultName,
      customName: null,
      juzNumber: getJuzForPage(num),
      rob3Number: getRob3ForPage(num),
      surahs: getSurahsForPage(num),
      inScope: false,
      quality: null,
      mistakes: null,
      lastRecited: null,
      dueDate: null,
      daysSinceRecited: null,
      daysUntilDue: null,
      status: "out_of_scope" as const,
    };
  });

  let result = fullList;

  if (filters.juz != null) {
    result = result.filter(p => p.juzNumber === filters.juz);
  }
  if (filters.surah != null) {
    const surah = SURAHS.find(s => s.number === filters.surah);
    if (surah) {
      result = result.filter(p => p.pageNumber >= surah.startPage && p.pageNumber <= surah.endPage);
    }
  }
  if (filters.inScope != null) {
    result = result.filter(p => p.inScope === filters.inScope);
  }
  if (filters.status) {
    result = result.filter(p => p.status === filters.status);
  }

  res.json(ListPageProgressResponse.parse(result));
});

router.patch("/progress/pages/:pageNumber", async (req, res): Promise<void> => {
  const params = UpdatePageProgressParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdatePageProgressBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const pageNumber = params.data.pageNumber;
  if (pageNumber < 1 || pageNumber > TOTAL_PAGES) {
    res.status(400).json({ error: "Invalid page number" });
    return;
  }

  await ensurePageExists(pageNumber);
  const settings = await getSettings();
  const recitedAt = parsed.data.recitedAt ? new Date(parsed.data.recitedAt) : new Date();
  const dueDate = calculateDueDate(recitedAt, parsed.data.quality, settings);

  const [updated] = await db
    .update(pageProgressTable)
    .set({
      quality: parsed.data.quality,
      mistakes: parsed.data.mistakes ?? null,
      lastRecited: recitedAt,
      dueDate,
      inScope: true,
    })
    .where(eq(pageProgressTable.pageNumber, pageNumber))
    .returning();

  await db.insert(recitationLogTable).values({
    pageNumber,
    quality: parsed.data.quality,
    mistakes: parsed.data.mistakes ?? null,
    recitedAt,
  });

  const enrichedResult = enrichPageProgress(updated);
  res.json(UpdatePageProgressResponse.parse(enrichedResult));
});

router.put("/progress/pages/:pageNumber/name", async (req, res): Promise<void> => {
  const params = RenamePageParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RenamePageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const pageNumber = params.data.pageNumber;
  if (pageNumber < 1 || pageNumber > TOTAL_PAGES) {
    res.status(400).json({ error: "Invalid page number" });
    return;
  }
  await ensurePageExists(pageNumber);
  const raw = parsed.data.customName;
  const next = raw == null || raw.trim().length === 0 ? null : raw.trim();
  const [updated] = await db
    .update(pageProgressTable)
    .set({ customName: next })
    .where(eq(pageProgressTable.pageNumber, pageNumber))
    .returning();
  res.json(RenamePageResponse.parse(enrichPageProgress(updated)));
});

router.post("/progress/recite-batch", async (req, res): Promise<void> => {
  const parsed = RecordBatchRecitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const settings = await getSettings();
  const recitedAt = parsed.data.recitedAt ? new Date(parsed.data.recitedAt) : new Date();
  const dueDate = calculateDueDate(recitedAt, parsed.data.quality, settings);
  const results = [];

  for (const pageNumber of parsed.data.pageNumbers) {
    if (pageNumber < 1 || pageNumber > TOTAL_PAGES) continue;
    await ensurePageExists(pageNumber);
    const [updated] = await db
      .update(pageProgressTable)
      .set({
        quality: parsed.data.quality,
        mistakes: parsed.data.mistakes ?? null,
        lastRecited: recitedAt,
        dueDate,
        inScope: true,
      })
      .where(eq(pageProgressTable.pageNumber, pageNumber))
      .returning();

    await db.insert(recitationLogTable).values({
      pageNumber,
      quality: parsed.data.quality,
      mistakes: parsed.data.mistakes ?? null,
      recitedAt,
    });

    results.push(enrichPageProgress(updated));
  }

  // Sync with active homework sessions
  const validPageNumbers = parsed.data.pageNumbers.filter(p => p >= 1 && p <= TOTAL_PAGES);
  if (validPageNumbers.length > 0) {
    const activeSessions = await db
      .select({ id: homeworkSessionsTable.id })
      .from(homeworkSessionsTable)
      .where(gte(homeworkSessionsTable.dueDate, recitedAt));

    const activeSessionIds = activeSessions.map(s => s.id);

    if (activeSessionIds.length > 0) {
      const isPositive = parsed.data.quality === "good" || parsed.data.quality === "excellent";

      if (isPositive) {
        await db
          .update(homeworkItemsTable)
          .set({ completed: true, quality: parsed.data.quality, completedAt: recitedAt })
          .where(
            and(
              inArray(homeworkItemsTable.homeworkId, activeSessionIds),
              inArray(homeworkItemsTable.pageNumber, validPageNumbers)
            )
          );
      } else {
        await db
          .update(homeworkItemsTable)
          .set({ completed: false, quality: null, completedAt: null })
          .where(
            and(
              inArray(homeworkItemsTable.homeworkId, activeSessionIds),
              inArray(homeworkItemsTable.pageNumber, validPageNumbers)
            )
          );
      }
    }
  }

  res.json(RecordBatchRecitationResponse.parse(results));
});

router.post("/progress/scope", async (req, res): Promise<void> => {
  const parsed = AddToScopeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const results = [];
  for (const pageNumber of parsed.data.pageNumbers) {
    if (pageNumber < 1 || pageNumber > TOTAL_PAGES) continue;
    await ensurePageExists(pageNumber);
    const [updated] = await db
      .update(pageProgressTable)
      .set({ inScope: true })
      .where(eq(pageProgressTable.pageNumber, pageNumber))
      .returning();
    results.push(enrichPageProgress(updated));
  }

  res.json(AddToScopeResponse.parse(results));
});

router.delete("/progress/scope", async (req, res): Promise<void> => {
  const parsed = RemoveFromScopeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const results = [];
  for (const pageNumber of parsed.data.pageNumbers) {
    const [updated] = await db
      .update(pageProgressTable)
      .set({ inScope: false })
      .where(eq(pageProgressTable.pageNumber, pageNumber))
      .returning();
    if (updated) results.push(enrichPageProgress(updated));
  }

  res.json(RemoveFromScopeResponse.parse(results));
});

router.get("/progress/daily-chart", async (req, res): Promise<void> => {
  const queryParams = GetDailyChartQueryParams.safeParse(req.query);
  const numDays = queryParams.success ? queryParams.data.days : 30;

  // Build an array of the last numDays dates
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateList: string[] = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    dateList.push(d.toISOString().slice(0, 10));
  }

  const since = new Date(today);
  since.setDate(since.getDate() - (numDays - 1));

  // Query: count distinct pages per day
  const rows = await db
    .select({
      date: sql<string>`DATE(${recitationLogTable.recitedAt} AT TIME ZONE 'UTC')`.as("date"),
      pages: sql<number>`COUNT(DISTINCT ${recitationLogTable.pageNumber})`.as("pages"),
    })
    .from(recitationLogTable)
    .where(gte(recitationLogTable.recitedAt, since))
    .groupBy(sql`DATE(${recitationLogTable.recitedAt} AT TIME ZONE 'UTC')`)
    .orderBy(sql`DATE(${recitationLogTable.recitedAt} AT TIME ZONE 'UTC')`);

  const rowMap = new Map(rows.map(r => [r.date, Number(r.pages)]));

  const result = dateList.map(date => ({
    date,
    pages: rowMap.get(date) ?? 0,
  }));

  res.json(GetDailyChartResponse.parse(result));
});

router.get("/progress/progress-chart", async (req, res): Promise<void> => {
  const queryParams = GetProgressChartQueryParams.safeParse(req.query);
  const requestedDays = queryParams.success ? queryParams.data.days : 30;
  const numDays = Math.min(Math.max(requestedDays, 1), 365);

  const settings = await getSettings();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const scopePages = await db
    .select({ pageNumber: pageProgressTable.pageNumber })
    .from(pageProgressTable)
    .where(eq(pageProgressTable.inScope, true));
  const inScopeSet = new Set(scopePages.map(p => p.pageNumber));

  const allLogs = await db
    .select({
      pageNumber: recitationLogTable.pageNumber,
      quality: recitationLogTable.quality,
      recitedAt: recitationLogTable.recitedAt,
    })
    .from(recitationLogTable)
    .orderBy(recitationLogTable.recitedAt);

  const result: { date: string; overdueCount: number; uniqueRecitedCount: number }[] = [];
  let logIdx = 0;
  const latestPerPage = new Map<number, { quality: string; recitedAt: Date }>();

  for (let i = numDays - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const endOfDay = new Date(day);
    endOfDay.setHours(23, 59, 59, 999);

    while (logIdx < allLogs.length && allLogs[logIdx].recitedAt <= endOfDay) {
      const log = allLogs[logIdx];
      latestPerPage.set(log.pageNumber, { quality: log.quality, recitedAt: log.recitedAt });
      logIdx++;
    }

    const uniqueRecitedCount = latestPerPage.size;

    let overdueCount = 0;
    for (const [pageNumber, info] of latestPerPage) {
      if (!inScopeSet.has(pageNumber)) continue;
      const dueDate = calculateDueDate(info.recitedAt, info.quality, settings);
      if (dueDate <= endOfDay) overdueCount++;
    }

    const yyyy = day.getFullYear();
    const mm = String(day.getMonth() + 1).padStart(2, "0");
    const dd = String(day.getDate()).padStart(2, "0");
    result.push({
      date: `${yyyy}-${mm}-${dd}`,
      overdueCount,
      uniqueRecitedCount,
    });
  }

  res.json(GetProgressChartResponse.parse(result));
});

router.get("/progress/activity", async (req, res): Promise<void> => {
  const queryParams = GetRecentActivityQueryParams.safeParse(req.query);
  const limit = queryParams.success && queryParams.data.limit ? queryParams.data.limit : 20;

  const logs = await db
    .select()
    .from(recitationLogTable)
    .orderBy(desc(recitationLogTable.recitedAt))
    .limit(limit);

  const activity = logs.map(log => ({
    id: log.id,
    pageNumber: log.pageNumber,
    juzNumber: getJuzForPage(log.pageNumber),
    surahName: getSurahsForPage(log.pageNumber),
    quality: log.quality,
    mistakes: log.mistakes,
    recitedAt: log.recitedAt,
  }));

  res.json(GetRecentActivityResponse.parse(activity));
});

function getMostCommonQuality(qualities: string[]): string {
  const priority: Record<string, number> = { relearn: 0, hard: 1, good: 2, excellent: 3 };
  const counts: Record<string, number> = {};
  for (const q of qualities) {
    counts[q] = (counts[q] || 0) + 1;
  }
  let worst = "excellent";
  for (const q of qualities) {
    if (priority[q] < priority[worst]) {
      worst = q;
    }
  }
  return worst;
}

export default router;
