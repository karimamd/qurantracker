/**
 * /api/homework/* — teacher-style assignment CRUD.
 *
 * A homework session bundles a set of pages a student must work on by a
 * `dueDate`, each tagged "memorize" (new) or "revise" (existing). Grading
 * an item is a real recitation: the PATCH item handler ALSO writes to
 * page_progress and recitation_log, so the dashboard / streak / due-date
 * machinery in routes/progress.ts stays consistent.
 *
 * Status derivation is denormalized at read time:
 *   - completed → all items completed
 *   - overdue   → dueDate's calendar day has fully passed (see
 *                 isHomeworkOverdue — note the +1-day grace window)
 *   - active    → otherwise
 *
 * Undo of a recitation in routes/progress.ts will re-derive `completed`
 * for affected items in active sessions. See that file's
 * DELETE /progress/activity/:id handler.
 */
import { Router, type IRouter } from "express";
import { db, homeworkSessionsTable, homeworkItemsTable, pageProgressTable, recitationLogTable } from "@workspace/db";
import { eq, and, sql, count, gte, inArray } from "drizzle-orm";
import {
  ListHomeworkResponse,
  CreateHomeworkBody,
  GetHomeworkParams,
  GetHomeworkResponse,
  UpdateHomeworkParams,
  UpdateHomeworkBody,
  UpdateHomeworkResponse,
  DeleteHomeworkParams,
  UpdateHomeworkItemParams,
  UpdateHomeworkItemBody,
  UpdateHomeworkItemResponse,
} from "@workspace/api-zod";
import { ensurePageExists, getSettings, calculateDueDate, getDefaultPageName } from "../lib/progress-helpers";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

/**
 * Homework is "overdue" only once the entire due date has passed — not the
 * instant the day begins. Due dates are stored as midnight UTC of the chosen
 * `YYYY-MM-DD`, so we treat the whole 24h window of that day as still active
 * and only flip to overdue from midnight UTC of the *next* day onwards.
 */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
function isHomeworkOverdue(dueDate: Date, now: Date): boolean {
  return now.getTime() >= dueDate.getTime() + ONE_DAY_MS;
}

router.get("/homework", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const sessions = await db.select().from(homeworkSessionsTable)
    .where(eq(homeworkSessionsTable.userId, userId))
    .orderBy(homeworkSessionsTable.createdAt);
  const now = new Date();

  // Derive "completed" from the live pageProgressTable.quality (good or
  // excellent) rather than the historical `homeworkItemsTable.completed`
  // flag. The flag only flips when the user picks a quality from the
  // homework detail page; reciting the same page in the Reader updates
  // pageProgressTable but leaves the flag stale, which used to cause the
  // homework list progress bar to stay at 0/N. Joining here keeps the
  // list view consistent with what /homework/:id already returns.
  const itemCounts = await db
    .select({
      homeworkId: homeworkItemsTable.homeworkId,
      totalItems: count(),
      completedItems: count(
        sql`CASE WHEN ${pageProgressTable.quality} IN ('good', 'excellent') THEN 1 END`,
      ),
    })
    .from(homeworkItemsTable)
    .leftJoin(
      pageProgressTable,
      and(
        eq(pageProgressTable.userId, userId),
        eq(pageProgressTable.pageNumber, homeworkItemsTable.pageNumber),
      ),
    )
    .where(eq(homeworkItemsTable.userId, userId))
    .groupBy(homeworkItemsTable.homeworkId);

  const countsMap = new Map(itemCounts.map(c => [c.homeworkId, { total: Number(c.totalItems), completed: Number(c.completedItems) }]));

  const result = sessions.map(session => {
    const counts = countsMap.get(session.id) || { total: 0, completed: 0 };
    let status: string;
    if (counts.completed === counts.total && counts.total > 0) {
      status = "completed";
    } else if (isHomeworkOverdue(session.dueDate, now)) {
      status = "overdue";
    } else {
      status = "active";
    }

    return {
      id: session.id,
      title: session.title,
      dueDate: session.dueDate,
      createdAt: session.createdAt,
      completedItems: counts.completed,
      totalItems: counts.total,
      status,
    };
  });

  res.json(ListHomeworkResponse.parse(result));
});

router.post("/homework", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreateHomeworkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db.insert(homeworkSessionsTable).values({
    userId,
    title: parsed.data.title,
    dueDate: new Date(parsed.data.dueDate),
  }).returning();

  const memorizePages = parsed.data.memorizePages || [];
  const revisePages = parsed.data.revisePages || [];

  for (const pageNumber of memorizePages) {
    await ensurePageExists(userId, pageNumber);
    await db.insert(homeworkItemsTable).values({
      userId,
      homeworkId: session.id,
      pageNumber,
      type: "memorize",
    });
  }

  for (const pageNumber of revisePages) {
    await ensurePageExists(userId, pageNumber);
    await db.insert(homeworkItemsTable).values({
      userId,
      homeworkId: session.id,
      pageNumber,
      type: "revise",
    });
  }

  const items = await db.select().from(homeworkItemsTable)
    .where(and(eq(homeworkItemsTable.userId, userId), eq(homeworkItemsTable.homeworkId, session.id)));

  res.status(201).json({
    id: session.id,
    title: session.title,
    dueDate: session.dueDate,
    createdAt: session.createdAt,
    completedItems: 0,
    totalItems: items.length,
    status: "active",
  });
});

router.get("/homework/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = GetHomeworkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db.select().from(homeworkSessionsTable)
    .where(and(eq(homeworkSessionsTable.userId, userId), eq(homeworkSessionsTable.id, params.data.id)));
  if (!session) {
    res.status(404).json({ error: "Homework session not found" });
    return;
  }

  const rows = await db
    .select({
      id: homeworkItemsTable.id,
      homeworkId: homeworkItemsTable.homeworkId,
      pageNumber: homeworkItemsTable.pageNumber,
      type: homeworkItemsTable.type,
      quality: pageProgressTable.quality,
      lastRecited: pageProgressTable.lastRecited,
      customName: pageProgressTable.customName,
    })
    .from(homeworkItemsTable)
    .leftJoin(
      pageProgressTable,
      and(
        eq(pageProgressTable.pageNumber, homeworkItemsTable.pageNumber),
        eq(pageProgressTable.userId, userId),
      ),
    )
    .where(and(eq(homeworkItemsTable.userId, userId), eq(homeworkItemsTable.homeworkId, session.id)))
    .orderBy(homeworkItemsTable.pageNumber);

  const pageNumbers = rows.map(r => r.pageNumber);
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);

  const weekCounts = pageNumbers.length > 0
    ? await db
        .select({
          pageNumber: recitationLogTable.pageNumber,
          weekCount: count(),
        })
        .from(recitationLogTable)
        .where(
          and(
            eq(recitationLogTable.userId, userId),
            inArray(recitationLogTable.pageNumber, pageNumbers),
            gte(recitationLogTable.recitedAt, weekStart)
          )
        )
        .groupBy(recitationLogTable.pageNumber)
    : [];

  const weekCountMap = new Map(weekCounts.map(t => [t.pageNumber, Number(t.weekCount)]));

  const detail = {
    id: session.id,
    title: session.title,
    dueDate: session.dueDate,
    createdAt: session.createdAt,
    items: rows.map(r => {
      const defaultName = getDefaultPageName(r.pageNumber);
      return {
        id: r.id,
        homeworkId: r.homeworkId,
        pageNumber: r.pageNumber,
        name: r.customName && r.customName.length > 0 ? r.customName : defaultName,
        customName: r.customName ?? null,
        type: r.type,
        completed: r.quality === "good" || r.quality === "excellent",
        quality: r.quality ?? null,
        completedAt: r.lastRecited ?? null,
        weekCount: weekCountMap.get(r.pageNumber) ?? 0,
      };
    }),
  };

  res.json(GetHomeworkResponse.parse(detail));
});

router.patch("/homework/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = UpdateHomeworkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateHomeworkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.dueDate !== undefined) updateData.dueDate = new Date(parsed.data.dueDate);

  // Confirm the session belongs to this user before touching items, even
  // when no session-level fields changed (the page-list fields below
  // mutate child rows independently and need the same authz check).
  const [existingSession] = await db
    .select()
    .from(homeworkSessionsTable)
    .where(and(eq(homeworkSessionsTable.userId, userId), eq(homeworkSessionsTable.id, params.data.id)));
  if (!existingSession) {
    res.status(404).json({ error: "Homework session not found" });
    return;
  }

  let updated = existingSession;
  if (Object.keys(updateData).length > 0) {
    const [row] = await db
      .update(homeworkSessionsTable)
      .set(updateData)
      .where(and(eq(homeworkSessionsTable.userId, userId), eq(homeworkSessionsTable.id, params.data.id)))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Homework session not found" });
      return;
    }
    updated = row;
  }

  // Reconcile a single page-type's items against the desired list:
  //   - delete items whose pageNumber dropped out of the list (this only
  //     removes the homework association — the underlying pageProgress
  //     row, recitation log entries, and ayah marks all stay intact);
  //   - insert items for pageNumbers that weren't there before, calling
  //     ensurePageExists so the new pages have a pageProgress row;
  //   - leave surviving items untouched so their quality / completed
  //     state is preserved across edits.
  const reconcileItems = async (type: "memorize" | "revise", desiredPages: number[]): Promise<void> => {
    const desired = Array.from(new Set(desiredPages.filter(p => Number.isInteger(p) && p > 0)));
    const existing = await db
      .select()
      .from(homeworkItemsTable)
      .where(and(
        eq(homeworkItemsTable.userId, userId),
        eq(homeworkItemsTable.homeworkId, updated.id),
        eq(homeworkItemsTable.type, type),
      ));
    const existingPages = new Set(existing.map(i => i.pageNumber));
    const desiredSet = new Set(desired);

    const toDeleteIds = existing.filter(i => !desiredSet.has(i.pageNumber)).map(i => i.id);
    const toAdd = desired.filter(p => !existingPages.has(p));

    if (toDeleteIds.length > 0) {
      await db.delete(homeworkItemsTable).where(and(
        eq(homeworkItemsTable.userId, userId),
        inArray(homeworkItemsTable.id, toDeleteIds),
      ));
    }
    for (const pageNumber of toAdd) {
      await ensurePageExists(userId, pageNumber);
      await db.insert(homeworkItemsTable).values({
        userId,
        homeworkId: updated.id,
        pageNumber,
        type,
      });
    }
  };

  if (parsed.data.memorizePages !== undefined) {
    await reconcileItems("memorize", parsed.data.memorizePages);
  }
  if (parsed.data.revisePages !== undefined) {
    await reconcileItems("revise", parsed.data.revisePages);
  }

  const items = await db.select().from(homeworkItemsTable)
    .where(and(eq(homeworkItemsTable.userId, userId), eq(homeworkItemsTable.homeworkId, updated.id)));
  const completedItems = items.filter(i => i.completed).length;
  const now = new Date();

  let status: string;
  if (completedItems === items.length && items.length > 0) {
    status = "completed";
  } else if (isHomeworkOverdue(updated.dueDate, now)) {
    status = "overdue";
  } else {
    status = "active";
  }

  res.json(UpdateHomeworkResponse.parse({
    id: updated.id,
    title: updated.title,
    dueDate: updated.dueDate,
    createdAt: updated.createdAt,
    completedItems,
    totalItems: items.length,
    status,
  }));
});

router.delete("/homework/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = DeleteHomeworkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(homeworkItemsTable)
    .where(and(eq(homeworkItemsTable.userId, userId), eq(homeworkItemsTable.homeworkId, params.data.id)));
  const [deleted] = await db.delete(homeworkSessionsTable)
    .where(and(eq(homeworkSessionsTable.userId, userId), eq(homeworkSessionsTable.id, params.data.id)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Homework session not found" });
    return;
  }

  res.sendStatus(204);
});

router.patch("/homework/:homeworkId/items/:itemId", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = UpdateHomeworkItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateHomeworkItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db.select().from(homeworkItemsTable)
    .where(and(
      eq(homeworkItemsTable.userId, userId),
      eq(homeworkItemsTable.id, params.data.itemId),
      eq(homeworkItemsTable.homeworkId, params.data.homeworkId),
    ));

  if (!item) {
    res.status(404).json({ error: "Homework item not found" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.completed !== undefined) {
    updateData.completed = parsed.data.completed;
    if (!parsed.data.completed && parsed.data.quality === undefined) {
      updateData.completedAt = null;
    }
  }
  if (parsed.data.quality !== undefined) {
    updateData.quality = parsed.data.quality;
    updateData.completedAt = new Date();
  }

  const [updated] = await db
    .update(homeworkItemsTable)
    .set(updateData)
    .where(and(eq(homeworkItemsTable.userId, userId), eq(homeworkItemsTable.id, params.data.itemId)))
    .returning();

  if (parsed.data.quality) {
    await ensurePageExists(userId, item.pageNumber);
    const settings = await getSettings(userId);
    const now = new Date();
    const dueDate = calculateDueDate(now, parsed.data.quality, settings);

    await db
      .update(pageProgressTable)
      .set({
        quality: parsed.data.quality,
        lastRecited: now,
        dueDate,
        inScope: true,
      })
      .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.pageNumber, item.pageNumber)));

    await db.insert(recitationLogTable).values({
      userId,
      pageNumber: item.pageNumber,
      quality: parsed.data.quality,
      recitedAt: now,
      dueDate,
    });
  }

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const [weekRow] = await db
    .select({ weekCount: count() })
    .from(recitationLogTable)
    .where(
      and(
        eq(recitationLogTable.userId, userId),
        eq(recitationLogTable.pageNumber, item.pageNumber),
        gte(recitationLogTable.recitedAt, weekStart)
      )
    );

  const currentProgress = await db
    .select({
      quality: pageProgressTable.quality,
      lastRecited: pageProgressTable.lastRecited,
      customName: pageProgressTable.customName,
    })
    .from(pageProgressTable)
    .where(and(eq(pageProgressTable.userId, userId), eq(pageProgressTable.pageNumber, item.pageNumber)));
  const globalQuality = currentProgress[0]?.quality ?? updated.quality;
  const globalLastRecited = currentProgress[0]?.lastRecited ?? updated.completedAt;
  const customName = currentProgress[0]?.customName ?? null;
  const defaultName = getDefaultPageName(updated.pageNumber);

  res.json(UpdateHomeworkItemResponse.parse({
    id: updated.id,
    homeworkId: updated.homeworkId,
    pageNumber: updated.pageNumber,
    name: customName && customName.length > 0 ? customName : defaultName,
    customName,
    type: updated.type,
    completed: globalQuality === "good" || globalQuality === "excellent",
    quality: globalQuality,
    completedAt: globalLastRecited,
    weekCount: Number(weekRow?.weekCount ?? 0),
  }));
});

export default router;
