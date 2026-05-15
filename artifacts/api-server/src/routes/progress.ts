/**
 * /api/progress/* — the central memorization-progress API surface.
 *
 * Mounted under /api by routes/index.ts and protected by `requireAuth`
 * (Clerk for signed-in users, `guest_id` cookie for guests). Every query
 * in this file MUST filter by `req.userId` — there is no row-level
 * security.
 *
 * Endpoint groups (verb-prefixed, exact paths):
 *   - GET    /progress/overview                          — dashboard top-line counts + streak
 *   - GET    /progress/juz, /progress/juz/:juzNumber     — per-Juz aggregation + detail w/ Rubs
 *   - GET    /progress/rob3                              — flat list of all 240 Rubs
 *   - GET    /progress/surah, /progress/surah/:n         — per-Surah aggregation + detail
 *   - GET    /progress/pages                             — full 1..604 list with filter chips
 *   - PATCH  /progress/pages/:pageNumber                 — grade a single page
 *   - GET/POST/DELETE /progress/pages/:pn/active-mistakes — per-ayah mistake marks
 *                                                          (advisory-locked; see below)
 *   - PUT    /progress/pages/:pageNumber/name            — per-user customName override
 *   - POST/DELETE /progress/scope                        — bulk add/remove from revision scope
 *   - POST   /progress/recite-batch                      — multi-page recitation submission
 *   - GET    /progress/activity                          — recent recitation feed
 *   - DELETE /progress/activity/:id                      — undo a recitation (locked txn)
 *   - GET    /progress/daily-chart, /progress-chart      — sparkline data for the dashboard
 *   - GET    /progress/mistakes                          — active (unresolved) mistakes feed
 *                                                          shown on /mistakes
 *
 * Cross-cutting concerns (search the file for these comments to see the
 * actual implementation):
 *   - Page rows are lazily created by `ensurePageExists` — pages a user
 *     has never touched are synthesized in-memory with status=out_of_scope.
 *   - Undo and active-mistake mutations use Postgres advisory locks /
 *     SELECT FOR UPDATE because cursors are recomputed by aggregating other
 *     tables, which would otherwise race under rapid taps.
 *   - Grading via homework also flows through here transitively (see
 *     routes/homework.ts → /:id/items/:itemId).
 *
 * Logging: use `req.log` (pino-http child) — never `console.log`.
 */
import { Router, type IRouter } from "express";
import { db, pageProgressTable, recitationLogTable, homeworkItemsTable, homeworkSessionsTable, ayahMistakesTable } from "@workspace/db";
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
  UndoRecitationParams,
  UndoRecitationResponse,
  GetDailyChartQueryParams,
  GetDailyChartResponse,
  GetProgressChartQueryParams,
  GetProgressChartResponse,
  GetSurahDetailParams,
  GetSurahDetailResponse,
  ListRob3ProgressResponse,
  GetMistakesQueryParams,
  GetMistakesResponse,
  ListActivePageMistakesParams,
  ListActivePageMistakesResponse,
  AddActivePageMistakeParams,
  AddActivePageMistakeBody,
  AddActivePageMistakeResponse,
  RemoveActivePageMistakeParams,
  RemoveActivePageMistakeBody,
  RemoveActivePageMistakeResponse,
  ClearAllActivePageMistakesParams,
  ClearAllActivePageMistakesResponse,
} from "@workspace/api-zod";
import {
  TOTAL_PAGES,
  TOTAL_ROB3S,
  JUZ_PAGE_RANGES,
  SURAHS,
  getJuzForPage,
  getRob3ForPage,
  getSurahsForPage,
  getJuzName,
  getRob3Range,
  ROB3S_PER_JUZ,
} from "../lib/quran-data";
import { enrichPageProgress, getSettings, calculateDueDate, ensurePageExists, getDefaultPageName, aggregateQuality } from "../lib/progress-helpers";
import { maybeAutoAssignPageRecitation } from "../lib/auto-assign-page";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/progress/overview", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const allPages = await db.select().from(pageProgressTable).where(eq(pageProgressTable.userId, userId));
  const enriched = allPages.map(enrichPageProgress);
  const inScope = enriched.filter(p => p.inScope);

  const now = new Date();
  let streakDays = 0;
  if (allPages.length > 0) {
    const logs = await db.select().from(recitationLogTable)
      .where(eq(recitationLogTable.userId, userId))
      .orderBy(desc(recitationLogTable.recitedAt));
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

router.get("/progress/juz", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const allPages = await db.select().from(pageProgressTable).where(eq(pageProgressTable.userId, userId));
  const enriched = allPages.map(enrichPageProgress);

  const juzList = JUZ_PAGE_RANGES.map(juz => {
    const juzPages = enriched.filter(p => p.juzNumber === juz.juz);
    const inScope = juzPages.filter(p => p.inScope);
    const lastRecitedArr = inScope.filter(p => p.lastRecited).sort((a, b) => b.lastRecited!.getTime() - a.lastRecited!.getTime());
    const nextDueArr = inScope.filter(p => p.dueDate).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());

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
      averageQuality: aggregateQuality(inScope),
      lastRecited: lastRecitedArr.length > 0 ? lastRecitedArr[0].lastRecited : null,
      nextDue: nextDueArr.length > 0 ? nextDueArr[0].dueDate : null,
    };
  });

  res.json(ListJuzProgressResponse.parse(juzList));
});

router.get("/progress/juz/:juzNumber", async (req, res): Promise<void> => {
  const userId = req.userId!;
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

  const allPages = await db.select().from(pageProgressTable).where(eq(pageProgressTable.userId, userId));
  const enriched = allPages.map(enrichPageProgress);
  const juzPages = enriched.filter(p => p.juzNumber === juz.juz);

  const rob3s = [];
  for (let i = 0; i < ROB3S_PER_JUZ; i++) {
    const rob3Number = (juz.juz - 1) * ROB3S_PER_JUZ + i + 1;
    const range = getRob3Range(rob3Number);
    // Filter by page-range overlap (not the page's primary rob3Number) so
    // boundary pages — which belong to two adjacent Rubs — are counted in
    // both. See getRob3Range comment.
    const rob3Pages = enriched.filter(p => p.pageNumber >= range.startPage && p.pageNumber <= range.endPage);
    const inScope = rob3Pages.filter(p => p.inScope);
    const lastRecitedArr = inScope.filter(p => p.lastRecited).sort((a, b) => b.lastRecited!.getTime() - a.lastRecited!.getTime());
    const nextDueArr = inScope.filter(p => p.dueDate).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
    const totalMistakes = inScope.reduce((sum, p) => sum + (p.mistakes || 0), 0);

    rob3s.push({
      rob3Number,
      juzNumber: juz.juz,
      startPage: range.startPage,
      endPage: range.endPage,
      totalPages: range.endPage - range.startPage + 1,
      pagesInScope: inScope.length,
      pagesOverdue: inScope.filter(p => p.status === "overdue").length,
      averageQuality: aggregateQuality(inScope),
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
        effectiveQuality: null,
        qualityDowngrades: 0,
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

router.get("/progress/rob3", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const allPages = await db.select().from(pageProgressTable).where(eq(pageProgressTable.userId, userId));
  const enriched = allPages.map(enrichPageProgress);

  const list = [];
  for (let n = 1; n <= TOTAL_ROB3S; n++) {
    const range = getRob3Range(n);
    const juzNumber = Math.floor((n - 1) / ROB3S_PER_JUZ) + 1;
    const partInJuz = ((n - 1) % ROB3S_PER_JUZ) + 1;
    // See getRob3Range — boundary pages belong to two Rubs, so filter by range overlap.
    const rob3Pages = enriched.filter(p => p.pageNumber >= range.startPage && p.pageNumber <= range.endPage);
    const inScope = rob3Pages.filter(p => p.inScope);
    const lastRecitedArr = inScope.filter(p => p.lastRecited).sort((a, b) => b.lastRecited!.getTime() - a.lastRecited!.getTime());
    const nextDueArr = inScope.filter(p => p.dueDate).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
    const totalMistakes = inScope.reduce((sum, p) => sum + (p.mistakes || 0), 0);
    const startSurah = SURAHS.find(s => s.number === range.startSurah);

    list.push({
      rob3Number: n,
      partInJuz,
      juzNumber,
      juzName: getJuzName(juzNumber),
      startPage: range.startPage,
      endPage: range.endPage,
      startSurahName: startSurah?.name ?? `Surah ${range.startSurah}`,
      startAyah: range.startAyah,
      totalPages: range.endPage - range.startPage + 1,
      pagesInScope: inScope.length,
      pagesOverdue: inScope.filter(p => p.status === "overdue").length,
      averageQuality: aggregateQuality(inScope),
      lastRecited: lastRecitedArr.length > 0 ? lastRecitedArr[0].lastRecited : null,
      nextDue: nextDueArr.length > 0 ? nextDueArr[0].dueDate : null,
      totalMistakes: inScope.length > 0 ? totalMistakes : null,
    });
  }

  res.json(ListRob3ProgressResponse.parse(list));
});

router.get("/progress/surah", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const allPages = await db.select().from(pageProgressTable).where(eq(pageProgressTable.userId, userId));
  const enriched = allPages.map(enrichPageProgress);

  const surahList = SURAHS.map(surah => {
    const surahPages = enriched.filter(p => p.pageNumber >= surah.startPage && p.pageNumber <= surah.endPage);
    const inScope = surahPages.filter(p => p.inScope);
    const lastRecitedArr = inScope.filter(p => p.lastRecited).sort((a, b) => b.lastRecited!.getTime() - a.lastRecited!.getTime());
    const nextDueArr = inScope.filter(p => p.dueDate).sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime());
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
      averageQuality: aggregateQuality(inScope),
      lastRecited: lastRecitedArr.length > 0 ? lastRecitedArr[0].lastRecited : null,
      nextDue: nextDueArr.length > 0 ? nextDueArr[0].dueDate : null,
    };
  });

  res.json(ListSurahProgressResponse.parse(surahList));
});

router.get("/progress/surah/:surahNumber", async (req, res): Promise<void> => {
  const userId = req.userId!;
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

  const allPages = await db.select().from(pageProgressTable).where(eq(pageProgressTable.userId, userId));
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
        effectiveQuality: null,
        qualityDowngrades: 0,
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
  const userId = req.userId!;
  const queryParams = ListPageProgressQueryParams.safeParse(req.query);
  const filters = queryParams.success ? queryParams.data : {};

  const allPages = await db.select().from(pageProgressTable).where(eq(pageProgressTable.userId, userId));
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
      effectiveQuality: null,
      qualityDowngrades: 0,
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
  const userId = req.userId!;
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

  await ensurePageExists(userId, pageNumber);
  const settings = await getSettings(userId);
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
    .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.pageNumber, pageNumber)))
    .returning();

  await db.insert(recitationLogTable).values({
    userId,
    pageNumber,
    quality: parsed.data.quality,
    mistakes: parsed.data.mistakes ?? null,
    recitedAt,
    dueDate,
  });

  // NOTE: per-ayah mistake marks are now persisted instantly via the
  // /progress/pages/:pageNumber/active-mistakes endpoints. The legacy
  // ayahMistakes payload on this PATCH is accepted for backward compatibility
  // but the reader no longer sends it.
  const ayahMistakes = parsed.data.ayahMistakes ?? [];
  if (ayahMistakes.length > 0) {
    await db.insert(ayahMistakesTable).values(
      ayahMistakes.map(m => ({
        userId,
        pageNumber,
        surahNumber: m.surahNumber,
        ayahNumberInSurah: m.ayahNumberInSurah,
        globalAyahNumber: m.globalAyahNumber,
        mistakeType: m.mistakeType,
        recitedAt,
      }))
    );
  }

  const enrichedResult = enrichPageProgress(updated);
  res.json(UpdatePageProgressResponse.parse(enrichedResult));
});

// ---------- Active per-ayah mistake marks (instant persistence) ----------

const ACTIVE_MISTAKE_LOCK_NAMESPACE = 0x61_79_61_68; // "ayah"

async function listActiveMistakesForPage(
  userId: string,
  pageNumber: number,
  autoExpire = false,
): Promise<{
  surahNumber: number;
  ayahNumberInSurah: number;
  globalAyahNumber: number;
  mistakeType: "memorization" | "link" | "cleared";
}[]> {
  const rows = await db
    .select({
      surahNumber: ayahMistakesTable.surahNumber,
      ayahNumberInSurah: ayahMistakesTable.ayahNumberInSurah,
      globalAyahNumber: ayahMistakesTable.globalAyahNumber,
      mistakeType: ayahMistakesTable.mistakeType,
    })
    .from(ayahMistakesTable)
    .where(
      and(
        eq(ayahMistakesTable.userId, userId),
        eq(ayahMistakesTable.pageNumber, pageNumber),
        sql`${ayahMistakesTable.resolvedAt} is null`,
        // When auto-expire is on, filter out marks created more than 14 days
        // ago so they are no longer shown as "active" in the Reader / Ayah
        // detail screens. The rows stay in the DB for analytics.
        autoExpire ? gte(ayahMistakesTable.createdAt, sql`now() - interval '14 days'`) : undefined,
      ),
    );

  // Dedupe — multiple historical rows for the same (ayah,type) collapse to one mark.
  // The list now also surfaces "cleared" rows (positive ticks the user placed
  // on an ayah). Cleared and memorization/link are mutually exclusive per ayah:
  // the POST handler below resolves the opposite side whenever a new mark of
  // either kind is added, so the active set should only ever contain one row
  // per (globalAyahNumber, mistakeType) and never contradictory marks.
  const seen = new Set<string>();
  const unique: {
    surahNumber: number;
    ayahNumberInSurah: number;
    globalAyahNumber: number;
    mistakeType: "memorization" | "link" | "cleared";
  }[] = [];
  for (const r of rows) {
    if (r.mistakeType !== "memorization" && r.mistakeType !== "link" && r.mistakeType !== "cleared") continue;
    const k = `${r.globalAyahNumber}|${r.mistakeType}`;
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push({
      surahNumber: r.surahNumber,
      ayahNumberInSurah: r.ayahNumberInSurah,
      globalAyahNumber: r.globalAyahNumber,
      mistakeType: r.mistakeType,
    });
  }
  return unique;
}

router.get("/progress/pages/:pageNumber/active-mistakes", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = ListActivePageMistakesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { autoExpireAyahMarks } = await getSettings(userId);
  const list = await listActiveMistakesForPage(userId, params.data.pageNumber, autoExpireAyahMarks);
  res.json(ListActivePageMistakesResponse.parse(list));
});

router.post("/progress/pages/:pageNumber/active-mistakes", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = AddActivePageMistakeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = AddActivePageMistakeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const pageNumber = params.data.pageNumber;
  if (pageNumber < 1 || pageNumber > TOTAL_PAGES) {
    res.status(400).json({ error: "Invalid page number" });
    return;
  }

  // Mutual-exclusion rule:
  //   - "cleared" and "memorization" are mutually exclusive: adding one resolves the other.
  //   - "link" is fully independent and can coexist with either "cleared" or "memorization".
  // So only cleared↔memorization supersede each other; link never supersedes anything.
  const opposites: ("memorization" | "link" | "cleared")[] =
    body.data.mistakeType === "cleared"
      ? ["memorization"]
      : body.data.mistakeType === "memorization"
      ? ["cleared"]
      : []; // "link" — independent, never supersedes another mark

  await db.transaction(async (tx) => {
    // Per-user advisory lock so concurrent toggles can't race and create duplicates.
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ACTIVE_MISTAKE_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
    );

    // Resolve any active marks on this ayah that contradict the new one.
    // "cleared" resolves "memorization" and vice-versa; "link" resolves nothing.
    await tx
      .update(ayahMistakesTable)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(ayahMistakesTable.userId, userId),
          eq(ayahMistakesTable.globalAyahNumber, body.data.globalAyahNumber),
          inArray(ayahMistakesTable.mistakeType, opposites),
          sql`${ayahMistakesTable.resolvedAt} is null`,
        ),
      );

    const existing = await tx
      .select({ id: ayahMistakesTable.id })
      .from(ayahMistakesTable)
      .where(
        and(
          eq(ayahMistakesTable.userId, userId),
          eq(ayahMistakesTable.globalAyahNumber, body.data.globalAyahNumber),
          eq(ayahMistakesTable.mistakeType, body.data.mistakeType),
          sql`${ayahMistakesTable.resolvedAt} is null`,
        ),
      )
      .limit(1);
    if (existing.length === 0) {
      await tx.insert(ayahMistakesTable).values({
        userId,
        pageNumber,
        surahNumber: body.data.surahNumber,
        ayahNumberInSurah: body.data.ayahNumberInSurah,
        globalAyahNumber: body.data.globalAyahNumber,
        mistakeType: body.data.mistakeType,
      });
    }
  });

  // Now that the user's mark is committed, give the auto-assign feature
  // (settings.autoAssignPageFromAyahs) a chance to record a page-level
  // recitation if every ayah on the page has been marked today. The
  // helper is a no-op when the flag is off and swallows its own errors
  // so it can never block the active-mistake response.
  await maybeAutoAssignPageRecitation(userId, pageNumber);

  const { autoExpireAyahMarks: expirePost } = await getSettings(userId);
  const list = await listActiveMistakesForPage(userId, pageNumber, expirePost);
  res.json(AddActivePageMistakeResponse.parse(list));
});

router.delete("/progress/pages/:pageNumber/active-mistakes", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = RemoveActivePageMistakeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = RemoveActivePageMistakeBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const pageNumber = params.data.pageNumber;

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ACTIVE_MISTAKE_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
    );
    await tx
      .update(ayahMistakesTable)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(ayahMistakesTable.userId, userId),
          eq(ayahMistakesTable.pageNumber, pageNumber),
          eq(ayahMistakesTable.globalAyahNumber, body.data.globalAyahNumber),
          eq(ayahMistakesTable.mistakeType, body.data.mistakeType),
          sql`${ayahMistakesTable.resolvedAt} is null`,
        ),
      );
  });

  // Removing a mark can also push the page across a quality threshold —
  // e.g. the user clears a mistake and the page now ticks below the
  // Good cap. Same swallow-and-warn semantics as the POST handler.
  await maybeAutoAssignPageRecitation(userId, pageNumber);

  const { autoExpireAyahMarks: expireDel } = await getSettings(userId);
  const list = await listActiveMistakesForPage(userId, pageNumber, expireDel);
  res.json(RemoveActivePageMistakeResponse.parse(list));
});

// Resolve every still-active mark (memorization, link AND cleared)
// for a single page in one transaction. Powers the Reader's
// "Clear all marks on this page" reset button so a user can wipe
// the page back to a blank slate without tapping each ayah.
router.delete("/progress/pages/:pageNumber/active-mistakes/all", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = ClearAllActivePageMistakesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const pageNumber = params.data.pageNumber;

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ACTIVE_MISTAKE_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
    );
    await tx
      .update(ayahMistakesTable)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(ayahMistakesTable.userId, userId),
          eq(ayahMistakesTable.pageNumber, pageNumber),
          sql`${ayahMistakesTable.resolvedAt} is null`,
        ),
      );
  });

  const { autoExpireAyahMarks: expireClear } = await getSettings(userId);
  const list = await listActiveMistakesForPage(userId, pageNumber, expireClear);
  res.json(ClearAllActivePageMistakesResponse.parse(list));
});

router.get("/progress/mistakes", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsedQuery = GetMistakesQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const limit = parsedQuery.data.limit ?? 200;
  const typeFilter = parsedQuery.data.type;

  // Only show mistakes that haven't been resolved (overwritten by a later
  // tick / unlinked). Resolved rows are kept in the DB for analytics but
  // shouldn't appear in the user-facing mistakes list or summary counts.
  // We also explicitly exclude "cleared" rows here — those represent positive
  // ticks (ayah recited correctly), not mistakes, and live alongside real
  // mistakes in the same table only because the active per-page endpoints
  // need to surface both kinds of marks.
  const whereClauses = [
    eq(ayahMistakesTable.userId, userId),
    sql`${ayahMistakesTable.resolvedAt} is null`,
    inArray(ayahMistakesTable.mistakeType, ["memorization", "link"]),
  ];
  if (typeFilter) whereClauses.push(eq(ayahMistakesTable.mistakeType, typeFilter));

  const rows = await db
    .select()
    .from(ayahMistakesTable)
    .where(and(...whereClauses))
    .orderBy(desc(ayahMistakesTable.recitedAt))
    .limit(limit);

  // Summary aggregates: also restricted to currently-active mistakes so the
  // numbers match what the user actually sees in the list.
  const allRows = await db
    .select({
      mistakeType: ayahMistakesTable.mistakeType,
      pageNumber: ayahMistakesTable.pageNumber,
      globalAyahNumber: ayahMistakesTable.globalAyahNumber,
    })
    .from(ayahMistakesTable)
    .where(
      and(
        eq(ayahMistakesTable.userId, userId),
        sql`${ayahMistakesTable.resolvedAt} is null`,
        inArray(ayahMistakesTable.mistakeType, ["memorization", "link"]),
      ),
    );

  let memorizationCount = 0;
  let linkCount = 0;
  const uniqueAyahs = new Set<number>();
  const uniquePages = new Set<number>();
  for (const r of allRows) {
    if (r.mistakeType === "link") linkCount++;
    else memorizationCount++;
    uniqueAyahs.add(r.globalAyahNumber);
    uniquePages.add(r.pageNumber);
  }

  const surahNameByNumber = new Map(SURAHS.map(s => [s.number, s.name]));
  const list = rows.map(r => ({
    id: r.id,
    pageNumber: r.pageNumber,
    surahNumber: r.surahNumber,
    surahName: surahNameByNumber.get(r.surahNumber) ?? `Surah ${r.surahNumber}`,
    ayahNumberInSurah: r.ayahNumberInSurah,
    globalAyahNumber: r.globalAyahNumber,
    mistakeType: r.mistakeType as "memorization" | "link",
    recitedAt: r.recitedAt,
  }));

  res.json(GetMistakesResponse.parse({
    summary: {
      total: allRows.length,
      memorizationCount,
      linkCount,
      uniqueAyahs: uniqueAyahs.size,
      uniquePages: uniquePages.size,
    },
    mistakes: list,
  }));
});

router.put("/progress/pages/:pageNumber/name", async (req, res): Promise<void> => {
  const userId = req.userId!;
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
  await ensurePageExists(userId, pageNumber);
  const raw = parsed.data.customName;
  const next = raw == null || raw.trim().length === 0 ? null : raw.trim();
  const [updated] = await db
    .update(pageProgressTable)
    .set({ customName: next })
    .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.pageNumber, pageNumber)))
    .returning();
  res.json(RenamePageResponse.parse(enrichPageProgress(updated)));
});

router.post("/progress/recite-batch", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = RecordBatchRecitationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const settings = await getSettings(userId);
  const recitedAt = parsed.data.recitedAt ? new Date(parsed.data.recitedAt) : new Date();
  const dueDate = calculateDueDate(recitedAt, parsed.data.quality, settings);
  const results = [];

  for (const pageNumber of parsed.data.pageNumbers) {
    if (pageNumber < 1 || pageNumber > TOTAL_PAGES) continue;
    await ensurePageExists(userId, pageNumber);
    const [updated] = await db
      .update(pageProgressTable)
      .set({
        quality: parsed.data.quality,
        mistakes: parsed.data.mistakes ?? null,
        lastRecited: recitedAt,
        dueDate,
        inScope: true,
      })
      .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.pageNumber, pageNumber)))
      .returning();

    await db.insert(recitationLogTable).values({
      userId,
      pageNumber,
      quality: parsed.data.quality,
      mistakes: parsed.data.mistakes ?? null,
      recitedAt,
      dueDate,
    });

    results.push(enrichPageProgress(updated));
  }

  const validPageNumbers = parsed.data.pageNumbers.filter(p => p >= 1 && p <= TOTAL_PAGES);
  if (validPageNumbers.length > 0) {
    const activeSessions = await db
      .select({ id: homeworkSessionsTable.id })
      .from(homeworkSessionsTable)
      .where(and(
        eq(homeworkSessionsTable.userId, userId),
        gte(homeworkSessionsTable.dueDate, recitedAt),
      ));

    const activeSessionIds = activeSessions.map(s => s.id);

    if (activeSessionIds.length > 0) {
      const isPositive = parsed.data.quality === "good" || parsed.data.quality === "excellent";

      if (isPositive) {
        await db
          .update(homeworkItemsTable)
          .set({ completed: true, quality: parsed.data.quality, completedAt: recitedAt })
          .where(
            and(
              eq(homeworkItemsTable.userId, userId),
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
              eq(homeworkItemsTable.userId, userId),
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
  const userId = req.userId!;
  const parsed = AddToScopeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const results = [];
  for (const pageNumber of parsed.data.pageNumbers) {
    if (pageNumber < 1 || pageNumber > TOTAL_PAGES) continue;
    await ensurePageExists(userId, pageNumber);
    const [updated] = await db
      .update(pageProgressTable)
      .set({ inScope: true })
      .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.pageNumber, pageNumber)))
      .returning();
    results.push(enrichPageProgress(updated));
  }

  res.json(AddToScopeResponse.parse(results));
});

router.delete("/progress/scope", async (req, res): Promise<void> => {
  const userId = req.userId!;
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
      .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.pageNumber, pageNumber)))
      .returning();
    if (updated) results.push(enrichPageProgress(updated));
  }

  res.json(RemoveFromScopeResponse.parse(results));
});

router.get("/progress/daily-chart", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const queryParams = GetDailyChartQueryParams.safeParse(req.query);
  const numDays = queryParams.success ? queryParams.data.days : 30;

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

  const rows = await db
    .select({
      date: sql<string>`DATE(${recitationLogTable.recitedAt} AT TIME ZONE 'UTC')`.as("date"),
      pages: sql<number>`COUNT(DISTINCT ${recitationLogTable.pageNumber})`.as("pages"),
    })
    .from(recitationLogTable)
    .where(and(eq(recitationLogTable.userId, userId), gte(recitationLogTable.recitedAt, since)))
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
  const userId = req.userId!;
  const queryParams = GetProgressChartQueryParams.safeParse(req.query);
  const requestedDays = queryParams.success ? queryParams.data.days : 30;
  const numDays = Math.min(Math.max(requestedDays, 1), 365);

  const settings = await getSettings(userId);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const scopePages = await db
    .select({ pageNumber: pageProgressTable.pageNumber })
    .from(pageProgressTable)
    .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.inScope, true)));
  const inScopeSet = new Set(scopePages.map(p => p.pageNumber));

  const allLogs = await db
    .select({
      pageNumber: recitationLogTable.pageNumber,
      quality: recitationLogTable.quality,
      recitedAt: recitationLogTable.recitedAt,
    })
    .from(recitationLogTable)
    .where(eq(recitationLogTable.userId, userId))
    .orderBy(recitationLogTable.recitedAt);

  const result: { date: string; overdueCount: number; dailyRecitedCount: number }[] = [];
  let logIdx = 0;
  const latestPerPage = new Map<number, { quality: string; recitedAt: Date }>();

  for (let i = numDays - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const startOfDay = new Date(day);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(day);
    endOfDay.setHours(23, 59, 59, 999);

    const recitedToday = new Set<number>();
    while (logIdx < allLogs.length && allLogs[logIdx].recitedAt <= endOfDay) {
      const log = allLogs[logIdx];
      latestPerPage.set(log.pageNumber, { quality: log.quality, recitedAt: log.recitedAt });
      if (log.recitedAt >= startOfDay) {
        recitedToday.add(log.pageNumber);
      }
      logIdx++;
    }

    const dailyRecitedCount = recitedToday.size;

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
      dailyRecitedCount,
    });
  }

  res.json(GetProgressChartResponse.parse(result));
});

router.get("/progress/activity", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const queryParams = GetRecentActivityQueryParams.safeParse(req.query);
  const limit = queryParams.success && queryParams.data.limit ? queryParams.data.limit : 20;

  const logs = await db
    .select()
    .from(recitationLogTable)
    .where(eq(recitationLogTable.userId, userId))
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

router.delete("/progress/activity/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = UndoRecitationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // Look up + ensure the page row exists outside the txn (ensurePageExists is
  // a separate read/insert path that we don't want to entangle in the lock).
  const [preLog] = await db
    .select()
    .from(recitationLogTable)
    .where(and(eq(recitationLogTable.id, params.data.id), eq(recitationLogTable.userId, userId)));
  if (!preLog) {
    res.status(404).json({ error: "Activity entry not found" });
    return;
  }
  await ensurePageExists(userId, preLog.pageNumber);

  // Recompute due-date policy: undo uses the user's CURRENT settings (matches
  // how new recitations are dated), so the restored due_date may differ from
  // the value it had when the prior log was first recorded.
  const settings = await getSettings(userId);

  const updated = await db.transaction(async (tx) => {
    // Lock the page_progress row to serialize concurrent writes for this page
    // (e.g. two simultaneous undos, or undo racing with a new recitation).
    const [lockedPage] = await tx
      .select()
      .from(pageProgressTable)
      .where(and(
        eq(pageProgressTable.userId, userId),
        eq(pageProgressTable.pageNumber, preLog.pageNumber),
      ))
      .for("update");

    // Re-read the log inside the txn — it could have been deleted by a racing
    // request between the pre-check and the lock acquisition.
    const [logEntry] = await tx
      .select()
      .from(recitationLogTable)
      .where(and(eq(recitationLogTable.id, params.data.id), eq(recitationLogTable.userId, userId)));
    if (!logEntry || !lockedPage) {
      return null;
    }

    await tx
      .delete(recitationLogTable)
      .where(and(eq(recitationLogTable.id, params.data.id), eq(recitationLogTable.userId, userId)));

    const pageNumber = logEntry.pageNumber;

    const [mostRecent] = await tx
      .select()
      .from(recitationLogTable)
      .where(and(eq(recitationLogTable.userId, userId), eq(recitationLogTable.pageNumber, pageNumber)))
      .orderBy(desc(recitationLogTable.recitedAt))
      .limit(1);

    let nextPage;
    if (mostRecent) {
      // Restore the page's previous due date verbatim from the prior log row.
      // For legacy rows recorded before due_date was persisted, fall back to
      // recomputing from current settings + the prior recitation.
      const dueDate = mostRecent.dueDate
        ?? calculateDueDate(mostRecent.recitedAt, mostRecent.quality, settings);
      [nextPage] = await tx
        .update(pageProgressTable)
        .set({
          quality: mostRecent.quality,
          mistakes: mostRecent.mistakes ?? null,
          lastRecited: mostRecent.recitedAt,
          dueDate,
        })
        .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.pageNumber, pageNumber)))
        .returning();
    } else {
      [nextPage] = await tx
        .update(pageProgressTable)
        .set({
          quality: null,
          mistakes: null,
          lastRecited: null,
          dueDate: null,
        })
        .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.pageNumber, pageNumber)))
        .returning();
    }

    // Recompute homework_items completion for this page across active homework
    // sessions (sessions whose due-date has not passed). recite-batch sets
    // completed=true when the latest log is "good"/"excellent", so undo should
    // mirror that derivation from the new most-recent remaining log.
    const now = new Date();
    const activeSessions = await tx
      .select({ id: homeworkSessionsTable.id })
      .from(homeworkSessionsTable)
      .where(and(
        eq(homeworkSessionsTable.userId, userId),
        gte(homeworkSessionsTable.dueDate, now),
      ));
    const activeSessionIds = activeSessions.map(s => s.id);

    if (activeSessionIds.length > 0) {
      const isPositive = mostRecent && (mostRecent.quality === "good" || mostRecent.quality === "excellent");
      if (isPositive) {
        await tx
          .update(homeworkItemsTable)
          .set({ completed: true, quality: mostRecent.quality, completedAt: mostRecent.recitedAt })
          .where(and(
            eq(homeworkItemsTable.userId, userId),
            inArray(homeworkItemsTable.homeworkId, activeSessionIds),
            eq(homeworkItemsTable.pageNumber, pageNumber),
          ));
      } else {
        await tx
          .update(homeworkItemsTable)
          .set({ completed: false, quality: null, completedAt: null })
          .where(and(
            eq(homeworkItemsTable.userId, userId),
            inArray(homeworkItemsTable.homeworkId, activeSessionIds),
            eq(homeworkItemsTable.pageNumber, pageNumber),
          ));
      }
    }

    return nextPage;
  });

  if (!updated) {
    res.status(404).json({ error: "Activity entry not found" });
    return;
  }

  res.json(UndoRecitationResponse.parse(enrichPageProgress(updated)));
});

export default router;
