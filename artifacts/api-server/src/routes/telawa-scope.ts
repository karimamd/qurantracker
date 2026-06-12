/**
 * /api/telawa/scope/* — "In-Scope Round-Robin" reading track + the Homework
 * reading-goal feed (/api/telawa/homework-reading).
 *
 * This is a LIGHTWEIGHT reading goal kept deliberately separate from the
 * full-Quran Khatmah subsystem in routes/telawa.ts. Instead of walking the
 * Mushaf 1→604, it cycles through only the pages currently in the user's
 * memorization scope (page_progress.in_scope = true) with a daily page goal
 * (falling back to settings.telawaPagesPerDay).
 *
 * "Either one counts" — a page is covered this cycle when it has EITHER an
 * explicit Telawa-scope read (telawa_scope_log row for the active cycle) OR
 * any quality recitation (recitation_log) recorded since the cycle started.
 * Only explicit reads are stored here; recitation credit is computed live.
 *
 * Cursor / completion is computed by set arithmetic over those two sources,
 * so mutations that depend on it run inside an advisory-locked transaction
 * keyed on the user id (distinct namespace from the Khatmah lock).
 *
 * NOTE on undo: undo removes the most recent explicit scope read. Because a
 * cycle auto-completes lazily during the very POST/GET that covers the last
 * page, undoing immediately after a cycle has rolled over will NOT reopen the
 * completed cycle — a deliberate simplification for this lightweight track.
 */
import { Router, type IRouter } from "express";
import {
  db,
  pageProgressTable,
  recitationLogTable,
  telawaScopeCycleTable,
  telawaScopeLogTable,
  homeworkSessionsTable,
  homeworkItemsTable,
} from "@workspace/db";
import { eq, and, desc, gte, sql, isNull, inArray } from "drizzle-orm";
import {
  GetTelawaScopeTodayResponse,
  RecordTelawaScopeReadBody,
  RecordTelawaScopeReadResponse,
  UndoTelawaScopeReadResponse,
  UpdateActiveScopeCycleBody,
  UpdateActiveScopeCycleResponse,
  GetTelawaHomeworkReadingResponse,
} from "@workspace/api-zod";
import { getSettings, getDefaultPageName, getWeeklyReadCounts } from "../lib/progress-helpers";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

const MAX_PAGE = 604;

// Distinct per-user advisory-lock namespace for the in-scope round-robin,
// chosen so it never collides with the Khatmah ("tlwa") or backup locks.
const SCOPE_LOCK_NAMESPACE = 0x74_73_63_70; // "tscp"

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
function isHomeworkOverdue(dueDate: Date, now: Date): boolean {
  return now.getTime() >= dueDate.getTime() + ONE_DAY_MS;
}

function startOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function clampPage(n: number): number {
  return Math.min(MAX_PAGE, Math.max(1, Math.floor(n)));
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Find or create the active in-scope cycle. Caller MUST hold the per-user
 * scope advisory lock.
 */
async function ensureActiveCycle(tx: Tx, userId: string) {
  const [existing] = await tx
    .select()
    .from(telawaScopeCycleTable)
    .where(and(eq(telawaScopeCycleTable.userId, userId), isNull(telawaScopeCycleTable.completedAt)))
    .orderBy(desc(telawaScopeCycleTable.id))
    .limit(1);
  if (existing) return existing;

  const [{ maxCycle }] = await tx
    .select({ maxCycle: sql<number>`coalesce(max(${telawaScopeCycleTable.cycleNumber}), 0)::int` })
    .from(telawaScopeCycleTable)
    .where(eq(telawaScopeCycleTable.userId, userId));

  const [created] = await tx
    .insert(telawaScopeCycleTable)
    .values({ userId, cycleNumber: Number(maxCycle ?? 0) + 1, startedAt: new Date() })
    .returning();
  return created;
}

/** In-scope page numbers for a user, ascending. */
async function inScopePages(tx: Tx, userId: string): Promise<number[]> {
  const rows = await tx
    .select({ pageNumber: pageProgressTable.pageNumber })
    .from(pageProgressTable)
    .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.inScope, true)))
    .orderBy(pageProgressTable.pageNumber);
  return rows.map((r) => r.pageNumber);
}

/**
 * Set of in-scope pages covered since `since`: explicit scope reads for the
 * active cycle UNION quality recitations recorded since the cycle started,
 * intersected with the in-scope set.
 */
async function coveredSince(
  tx: Tx,
  userId: string,
  cycleId: number,
  since: Date,
  inScope: Set<number>,
): Promise<Set<number>> {
  const [explicit, recited] = await Promise.all([
    tx
      .select({ pageNumber: telawaScopeLogTable.pageNumber })
      .from(telawaScopeLogTable)
      .where(and(eq(telawaScopeLogTable.userId, userId), eq(telawaScopeLogTable.cycleId, cycleId))),
    tx
      .select({ pageNumber: recitationLogTable.pageNumber })
      .from(recitationLogTable)
      .where(and(eq(recitationLogTable.userId, userId), gte(recitationLogTable.recitedAt, since))),
  ]);
  const covered = new Set<number>();
  for (const r of explicit) if (inScope.has(r.pageNumber)) covered.add(r.pageNumber);
  for (const r of recited) if (inScope.has(r.pageNumber)) covered.add(r.pageNumber);
  return covered;
}

async function buildScopeToday(userId: string) {
  const settings = await getSettings(userId);
  const defaultPagesPerDay = settings.telawaPagesPerDay ?? 5;

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${SCOPE_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
    );

    let active = await ensureActiveCycle(tx, userId);
    const pages = await inScopePages(tx, userId);
    const inScopeSet = new Set(pages);
    const total = pages.length;

    // Lazily roll the cycle over when the whole scope is covered. The new
    // cycle's startedAt = now, so recitation credit resets and the next
    // iteration cannot re-complete (unless total is 0, which short-circuits).
    let covered = await coveredSince(tx, userId, active.id, active.startedAt, inScopeSet);
    if (total > 0 && covered.size >= total) {
      const rolloverAt = new Date();
      await tx
        .update(telawaScopeCycleTable)
        .set({ completedAt: rolloverAt })
        .where(eq(telawaScopeCycleTable.id, active.id));
      const [next] = await tx
        .insert(telawaScopeCycleTable)
        .values({ userId, cycleNumber: active.cycleNumber + 1, startedAt: rolloverAt })
        .returning();
      active = next;
      covered = await coveredSince(tx, userId, active.id, active.startedAt, inScopeSet);
    }

    const pagesPerDay = active.pagesPerDay ?? defaultPagesPerDay;
    const upcomingPages = pages.filter((p) => !covered.has(p)).slice(0, pagesPerDay);

    // Pages covered today (explicit scope read today OR recitation today),
    // intersected with the in-scope set.
    const todayStart = startOfTodayUtc(new Date());
    const coveredToday = await coveredSince(tx, userId, active.id, todayStart, inScopeSet);
    // coveredSince above scopes explicit reads to the active cycle; for
    // "today" we additionally want explicit reads from before a same-day
    // rollover. Re-add any explicit scope reads from today regardless of cycle.
    const explicitToday = await tx
      .select({ pageNumber: telawaScopeLogTable.pageNumber })
      .from(telawaScopeLogTable)
      .where(and(eq(telawaScopeLogTable.userId, userId), gte(telawaScopeLogTable.readAt, todayStart)));
    for (const r of explicitToday) if (inScopeSet.has(r.pageNumber)) coveredToday.add(r.pageNumber);

    const recent = await tx
      .select()
      .from(telawaScopeLogTable)
      .where(and(eq(telawaScopeLogTable.userId, userId), gte(telawaScopeLogTable.readAt, todayStart)))
      .orderBy(desc(telawaScopeLogTable.readAt), desc(telawaScopeLogTable.id));

    return {
      pagesPerDay,
      cycleNumber: active.cycleNumber,
      totalInScope: total,
      readInCycle: covered.size,
      readToday: coveredToday.size,
      pagesPerDayOverride: active.pagesPerDay,
      upcomingPages,
      recentReads: recent.map((r) => ({
        id: r.id,
        pageNumber: r.pageNumber,
        cycleNumber: r.cycleNumber,
        readAt: r.readAt.toISOString(),
      })),
    };
  });
}

router.get("/telawa/scope/today", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const today = await buildScopeToday(userId);
  res.json(GetTelawaScopeTodayResponse.parse(today));
});

router.post("/telawa/scope/read", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = RecordTelawaScopeReadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${SCOPE_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
    );
    const active = await ensureActiveCycle(tx, userId);
    await tx.insert(telawaScopeLogTable).values({
      userId,
      pageNumber: parsed.data.pageNumber,
      cycleNumber: active.cycleNumber,
      cycleId: active.id,
    });
  });

  // buildScopeToday handles auto-completion/rollover when the scope is covered.
  const today = await buildScopeToday(userId);
  res.json(RecordTelawaScopeReadResponse.parse(today));
});

router.delete("/telawa/scope/read/last", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const undone = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${SCOPE_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
    );
    const [last] = await tx
      .select()
      .from(telawaScopeLogTable)
      .where(eq(telawaScopeLogTable.userId, userId))
      .orderBy(desc(telawaScopeLogTable.readAt), desc(telawaScopeLogTable.id))
      .limit(1);
    if (!last) return false;
    await tx.delete(telawaScopeLogTable).where(eq(telawaScopeLogTable.id, last.id));
    return true;
  });

  if (!undone) {
    res.status(404).json({ error: "Nothing to undo" });
    return;
  }
  const today = await buildScopeToday(userId);
  res.json(UndoTelawaScopeReadResponse.parse(today));
});

router.patch("/telawa/scope/active", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = UpdateActiveScopeCycleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${SCOPE_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
    );
    const active = await ensureActiveCycle(tx, userId);
    if (parsed.data.pagesPerDay !== undefined) {
      await tx
        .update(telawaScopeCycleTable)
        .set({
          pagesPerDay:
            parsed.data.pagesPerDay === null ? null : clampPage(parsed.data.pagesPerDay),
        })
        .where(eq(telawaScopeCycleTable.id, active.id));
    }
  });

  const today = await buildScopeToday(userId);
  res.json(UpdateActiveScopeCycleResponse.parse(today));
});

router.get("/telawa/homework-reading", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const settings = await getSettings(userId);
  const now = new Date();

  const sessions = await db
    .select()
    .from(homeworkSessionsTable)
    .where(eq(homeworkSessionsTable.userId, userId));
  const activeIds = sessions.filter((s) => !isHomeworkOverdue(s.dueDate, now)).map((s) => s.id);

  let pages: Array<{ pageNumber: number; name: string; weekCount: number }> = [];
  if (activeIds.length > 0) {
    const itemRows = await db
      .select({
        pageNumber: homeworkItemsTable.pageNumber,
        customName: pageProgressTable.customName,
      })
      .from(homeworkItemsTable)
      .leftJoin(
        pageProgressTable,
        and(
          eq(pageProgressTable.userId, userId),
          eq(pageProgressTable.pageNumber, homeworkItemsTable.pageNumber),
        ),
      )
      .where(and(eq(homeworkItemsTable.userId, userId), inArray(homeworkItemsTable.homeworkId, activeIds)));

    const nameByPage = new Map<number, string>();
    for (const r of itemRows) {
      if (nameByPage.has(r.pageNumber)) continue;
      const defaultName = getDefaultPageName(r.pageNumber);
      nameByPage.set(r.pageNumber, r.customName && r.customName.length > 0 ? r.customName : defaultName);
    }

    const pageNumbers = Array.from(nameByPage.keys()).sort((a, b) => a - b);
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    const weekCounts = await getWeeklyReadCounts(userId, pageNumbers, weekStart);

    pages = pageNumbers.map((p) => ({
      pageNumber: p,
      name: nameByPage.get(p) ?? getDefaultPageName(p),
      weekCount: weekCounts.get(p) ?? 0,
    }));
  }

  res.json(
    GetTelawaHomeworkReadingResponse.parse({
      weeklyGoal: settings.homeworkWeeklyReadGoal,
      pages,
    }),
  );
});

export default router;
