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
import { ensurePageExists, getSettings, calculateDueDate, enrichPageProgress, getDefaultPageName } from "../lib/progress-helpers";

const router: IRouter = Router();

router.get("/homework", async (_req, res): Promise<void> => {
  const sessions = await db.select().from(homeworkSessionsTable).orderBy(homeworkSessionsTable.createdAt);
  const now = new Date();

  const itemCounts = await db
    .select({
      homeworkId: homeworkItemsTable.homeworkId,
      totalItems: count(),
      completedItems: count(sql`CASE WHEN ${homeworkItemsTable.completed} = true THEN 1 END`),
    })
    .from(homeworkItemsTable)
    .groupBy(homeworkItemsTable.homeworkId);

  const countsMap = new Map(itemCounts.map(c => [c.homeworkId, { total: Number(c.totalItems), completed: Number(c.completedItems) }]));

  const result = sessions.map(session => {
    const counts = countsMap.get(session.id) || { total: 0, completed: 0 };
    let status: string;
    if (counts.completed === counts.total && counts.total > 0) {
      status = "completed";
    } else if (session.dueDate < now) {
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
  const parsed = CreateHomeworkBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db.insert(homeworkSessionsTable).values({
    title: parsed.data.title,
    dueDate: new Date(parsed.data.dueDate),
  }).returning();

  const memorizePages = parsed.data.memorizePages || [];
  const revisePages = parsed.data.revisePages || [];

  for (const pageNumber of memorizePages) {
    await ensurePageExists(pageNumber);
    await db.insert(homeworkItemsTable).values({
      homeworkId: session.id,
      pageNumber,
      type: "memorize",
    });
  }

  for (const pageNumber of revisePages) {
    await ensurePageExists(pageNumber);
    await db.insert(homeworkItemsTable).values({
      homeworkId: session.id,
      pageNumber,
      type: "revise",
    });
  }

  const items = await db.select().from(homeworkItemsTable).where(eq(homeworkItemsTable.homeworkId, session.id));

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
  const params = GetHomeworkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [session] = await db.select().from(homeworkSessionsTable).where(eq(homeworkSessionsTable.id, params.data.id));
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
    .leftJoin(pageProgressTable, eq(pageProgressTable.pageNumber, homeworkItemsTable.pageNumber))
    .where(eq(homeworkItemsTable.homeworkId, session.id))
    .orderBy(homeworkItemsTable.pageNumber);

  const pageNumbers = rows.map(r => r.pageNumber);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayCounts = pageNumbers.length > 0
    ? await db
        .select({
          pageNumber: recitationLogTable.pageNumber,
          todayCount: count(),
        })
        .from(recitationLogTable)
        .where(
          and(
            inArray(recitationLogTable.pageNumber, pageNumbers),
            gte(recitationLogTable.recitedAt, todayStart)
          )
        )
        .groupBy(recitationLogTable.pageNumber)
    : [];

  const todayCountMap = new Map(todayCounts.map(t => [t.pageNumber, Number(t.todayCount)]));

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
        todayCount: todayCountMap.get(r.pageNumber) ?? 0,
      };
    }),
  };

  res.json(GetHomeworkResponse.parse(detail));
});

router.patch("/homework/:id", async (req, res): Promise<void> => {
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

  const [updated] = await db
    .update(homeworkSessionsTable)
    .set(updateData)
    .where(eq(homeworkSessionsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Homework session not found" });
    return;
  }

  const items = await db.select().from(homeworkItemsTable).where(eq(homeworkItemsTable.homeworkId, updated.id));
  const completedItems = items.filter(i => i.completed).length;
  const now = new Date();

  let status: string;
  if (completedItems === items.length && items.length > 0) {
    status = "completed";
  } else if (updated.dueDate < now) {
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
  const params = DeleteHomeworkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(homeworkItemsTable).where(eq(homeworkItemsTable.homeworkId, params.data.id));
  const [deleted] = await db.delete(homeworkSessionsTable).where(eq(homeworkSessionsTable.id, params.data.id)).returning();

  if (!deleted) {
    res.status(404).json({ error: "Homework session not found" });
    return;
  }

  res.sendStatus(204);
});

router.patch("/homework/:homeworkId/items/:itemId", async (req, res): Promise<void> => {
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
    .where(eq(homeworkItemsTable.id, params.data.itemId))
    .returning();

  if (parsed.data.quality) {
    await ensurePageExists(item.pageNumber);
    const settings = await getSettings();
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
      .where(eq(pageProgressTable.pageNumber, item.pageNumber));

    await db.insert(recitationLogTable).values({
      pageNumber: item.pageNumber,
      quality: parsed.data.quality,
      recitedAt: now,
    });
  }

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [todayRow] = await db
    .select({ todayCount: count() })
    .from(recitationLogTable)
    .where(
      and(
        eq(recitationLogTable.pageNumber, item.pageNumber),
        gte(recitationLogTable.recitedAt, todayStart)
      )
    );

  const currentProgress = await db
    .select({
      quality: pageProgressTable.quality,
      lastRecited: pageProgressTable.lastRecited,
      customName: pageProgressTable.customName,
    })
    .from(pageProgressTable)
    .where(eq(pageProgressTable.pageNumber, item.pageNumber));
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
    todayCount: Number(todayRow?.todayCount ?? 0),
  }));
});

export default router;
