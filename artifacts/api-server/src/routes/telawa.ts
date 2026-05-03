import { Router, type IRouter } from "express";
import { db, telawaLogTable } from "@workspace/db";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import {
  GetTelawaTodayResponse,
  RecordTelawaReadBody,
  RecordTelawaReadResponse,
  UndoTelawaReadResponse,
  GetTelawaStatsResponse,
} from "@workspace/api-zod";
import { getSettings } from "../lib/progress-helpers";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

const TOTAL_PAGES = 604;

function startOfTodayUtc(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return d;
}

function computeUpcoming(nextPage: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const p = ((nextPage - 1 + i) % TOTAL_PAGES) + 1;
    out.push(p);
  }
  return out;
}

async function buildToday(userId: string) {
  const settings = await getSettings(userId);
  const pagesPerDay = settings.telawaPagesPerDay ?? 5;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(telawaLogTable)
    .where(eq(telawaLogTable.userId, userId));
  const totalRead = Number(total ?? 0);

  const cursorIndex = totalRead % TOTAL_PAGES;
  const nextPage = cursorIndex + 1;
  const cycleNumber = Math.floor(totalRead / TOTAL_PAGES) + 1;

  const todayStart = startOfTodayUtc(new Date());
  const [{ today }] = await db
    .select({ today: sql<number>`count(*)::int` })
    .from(telawaLogTable)
    .where(and(eq(telawaLogTable.userId, userId), gte(telawaLogTable.readAt, todayStart)));
  const readToday = Number(today ?? 0);

  const recent = await db
    .select()
    .from(telawaLogTable)
    .where(and(eq(telawaLogTable.userId, userId), gte(telawaLogTable.readAt, todayStart)))
    .orderBy(desc(telawaLogTable.readAt));

  return {
    pagesPerDay,
    nextPage,
    cycleNumber,
    totalRead,
    readToday,
    upcomingPages: computeUpcoming(nextPage, pagesPerDay),
    recentReads: recent.map((r) => ({
      id: r.id,
      pageNumber: r.pageNumber,
      cycleNumber: r.cycleNumber,
      readAt: r.readAt.toISOString(),
    })),
  };
}

router.get("/telawa/today", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const today = await buildToday(userId);
  res.json(GetTelawaTodayResponse.parse(today));
});

router.post("/telawa/read", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = RecordTelawaReadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Compute current cursor inside a transaction so concurrent reads can't
  // double-advance.
  const result = await db.transaction(async (tx) => {
    const [{ total }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(telawaLogTable)
      .where(eq(telawaLogTable.userId, userId));
    const totalRead = Number(total ?? 0);
    const nextPage = (totalRead % TOTAL_PAGES) + 1;
    const cycleNumber = Math.floor(totalRead / TOTAL_PAGES) + 1;

    if (parsed.data.pageNumber !== nextPage) {
      return { conflict: true as const, nextPage };
    }

    await tx.insert(telawaLogTable).values({
      userId,
      pageNumber: nextPage,
      cycleNumber,
    });
    return { conflict: false as const };
  });

  if (result.conflict) {
    res.status(409).json({
      error: `Out of sequence. Next page is ${result.nextPage}.`,
      nextPage: result.nextPage,
    });
    return;
  }

  const today = await buildToday(userId);
  res.json(RecordTelawaReadResponse.parse(today));
});

router.delete("/telawa/read/last", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [last] = await db
    .select()
    .from(telawaLogTable)
    .where(eq(telawaLogTable.userId, userId))
    .orderBy(desc(telawaLogTable.readAt), desc(telawaLogTable.id))
    .limit(1);
  if (!last) {
    res.status(404).json({ error: "Nothing to undo" });
    return;
  }
  await db.delete(telawaLogTable).where(eq(telawaLogTable.id, last.id));
  const today = await buildToday(userId);
  res.json(UndoTelawaReadResponse.parse(today));
});

router.get("/telawa/stats", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const settings = await getSettings(userId);
  const pagesPerDay = settings.telawaPagesPerDay ?? 5;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(telawaLogTable)
    .where(eq(telawaLogTable.userId, userId));
  const totalRead = Number(total ?? 0);
  const nextPage = (totalRead % TOTAL_PAGES) + 1;
  const currentCycle = Math.floor(totalRead / TOTAL_PAGES) + 1;

  const todayStart = startOfTodayUtc(new Date());
  const [{ today }] = await db
    .select({ today: sql<number>`count(*)::int` })
    .from(telawaLogTable)
    .where(and(eq(telawaLogTable.userId, userId), gte(telawaLogTable.readAt, todayStart)));
  const readToday = Number(today ?? 0);

  const since = new Date(todayStart);
  since.setUTCDate(since.getUTCDate() - 29);
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${telawaLogTable.readAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
    })
    .from(telawaLogTable)
    .where(and(eq(telawaLogTable.userId, userId), gte(telawaLogTable.readAt, since)))
    .groupBy(sql`date_trunc('day', ${telawaLogTable.readAt} AT TIME ZONE 'UTC')`);

  const counts = new Map(rows.map((r) => [r.day, Number(r.count)]));
  const last30Days: Array<{ date: string; count: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(todayStart);
    d.setUTCDate(d.getUTCDate() - i);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
    last30Days.push({ date: key, count: counts.get(key) ?? 0 });
  }

  res.json(
    GetTelawaStatsResponse.parse({
      totalRead,
      currentCycle,
      nextPage,
      pagesPerDay,
      readToday,
      last30Days,
    }),
  );
});

export default router;
