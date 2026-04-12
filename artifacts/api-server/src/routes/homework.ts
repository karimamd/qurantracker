import { Router, type IRouter } from "express";
import { db, homeworkSessionsTable, homeworkItemsTable, pageProgressTable } from "@workspace/db";
import { eq, and, sql, count } from "drizzle-orm";
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
import { ensurePageExists, getSettings, calculateDueDate, enrichPageProgress } from "../lib/progress-helpers";
import { recitationLogTable } from "@workspace/db";

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

  const items = await db.select().from(homeworkItemsTable).where(eq(homeworkItemsTable.homeworkId, session.id));

  const detail = {
    id: session.id,
    title: session.title,
    dueDate: session.dueDate,
    createdAt: session.createdAt,
    items: items.map(i => ({
      id: i.id,
      homeworkId: i.homeworkId,
      pageNumber: i.pageNumber,
      type: i.type,
      completed: i.completed,
      quality: i.quality,
      completedAt: i.completedAt,
    })),
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
    if (parsed.data.completed) {
      updateData.completedAt = new Date();
    } else {
      updateData.completedAt = null;
    }
  }
  if (parsed.data.quality !== undefined) {
    updateData.quality = parsed.data.quality;
  }

  const [updated] = await db
    .update(homeworkItemsTable)
    .set(updateData)
    .where(eq(homeworkItemsTable.id, params.data.itemId))
    .returning();

  if (parsed.data.completed && parsed.data.quality) {
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

  res.json(UpdateHomeworkItemResponse.parse({
    id: updated.id,
    homeworkId: updated.homeworkId,
    pageNumber: updated.pageNumber,
    type: updated.type,
    completed: updated.completed,
    quality: updated.quality,
    completedAt: updated.completedAt,
  }));
});

export default router;
