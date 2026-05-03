import { Router, type IRouter } from "express";
import { db, telawaLogTable, telawaKhatmahTable } from "@workspace/db";
import { eq, and, desc, gte, sql, isNull } from "drizzle-orm";
import {
  GetTelawaTodayResponse,
  RecordTelawaReadBody,
  RecordTelawaReadResponse,
  UndoTelawaReadResponse,
  GetTelawaStatsResponse,
  StartKhatmahBody,
  StartKhatmahResponse,
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

function clampPage(n: number): number {
  return Math.min(TOTAL_PAGES, Math.max(1, Math.floor(n)));
}

function computeUpcoming(nextPage: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const p = ((nextPage - 1 + i) % TOTAL_PAGES) + 1;
    out.push(p);
  }
  return out;
}

// Stable per-user advisory-lock key. We use a fixed namespace int (chosen
// arbitrarily for "telawa") plus hashtext(userId) so different features can
// take different advisory locks for the same user without colliding.
const TELAWA_LOCK_NAMESPACE = 0x74_6c_77_61; // "tlwa"

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Find or create the active Khatmah for a user. Lazily backfills users who
 * had Telawa logs before the Khatmah model existed: their existing logs are
 * grouped by `cycle_number`, one Khatmah row is created per group with
 * `start_page = 1`, the latest cycle stays open and older cycles are closed.
 *
 * Caller MUST already hold the per-user telawa advisory lock.
 */
async function ensureActiveKhatmah(tx: Tx, userId: string) {
  const [existingActive] = await tx
    .select()
    .from(telawaKhatmahTable)
    .where(and(eq(telawaKhatmahTable.userId, userId), isNull(telawaKhatmahTable.completedAt)))
    .orderBy(desc(telawaKhatmahTable.id))
    .limit(1);
  if (existingActive) return existingActive;

  // No active khatmah. Backfill from any pre-existing logs first.
  const cycleRows = await tx
    .select({
      cycleNumber: telawaLogTable.cycleNumber,
      count: sql<number>`count(*)::int`,
      minRead: sql<Date>`min(${telawaLogTable.readAt})`,
      maxRead: sql<Date>`max(${telawaLogTable.readAt})`,
    })
    .from(telawaLogTable)
    .where(and(eq(telawaLogTable.userId, userId), isNull(telawaLogTable.khatmahId)))
    .groupBy(telawaLogTable.cycleNumber)
    .orderBy(telawaLogTable.cycleNumber);

  let lastInserted: typeof telawaKhatmahTable.$inferSelect | null = null;
  if (cycleRows.length > 0) {
    const maxCycle = Math.max(...cycleRows.map((r) => r.cycleNumber));
    for (const c of cycleRows) {
      const isLatest = c.cycleNumber === maxCycle;
      const isFull = Number(c.count) >= TOTAL_PAGES;
      const [inserted] = await tx
        .insert(telawaKhatmahTable)
        .values({
          userId,
          startPage: 1,
          cycleNumber: c.cycleNumber,
          startedAt: c.minRead,
          completedAt: isLatest && !isFull ? null : c.maxRead,
        })
        .returning();
      await tx
        .update(telawaLogTable)
        .set({ khatmahId: inserted.id })
        .where(
          and(
            eq(telawaLogTable.userId, userId),
            eq(telawaLogTable.cycleNumber, c.cycleNumber),
            isNull(telawaLogTable.khatmahId),
          ),
        );
      lastInserted = inserted;
    }
    if (lastInserted && !lastInserted.completedAt) return lastInserted;
  }

  // Either no pre-existing logs, or every existing cycle was already full.
  // Open a fresh Khatmah from page 1 (default) so the user has somewhere to write.
  const nextCycleNumber = lastInserted ? lastInserted.cycleNumber + 1 : 1;
  const [created] = await tx
    .insert(telawaKhatmahTable)
    .values({
      userId,
      startPage: 1,
      cycleNumber: nextCycleNumber,
      startedAt: new Date(),
      completedAt: null,
    })
    .returning();
  return created;
}

async function buildToday(userId: string) {
  const settings = await getSettings(userId);
  const pagesPerDay = settings.telawaPagesPerDay ?? 5;

  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${TELAWA_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
    );
    const active = await ensureActiveKhatmah(tx, userId);

    const [{ total }] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(telawaLogTable)
      .where(eq(telawaLogTable.userId, userId));
    const totalRead = Number(total ?? 0);

    const [{ inKhatmah }] = await tx
      .select({ inKhatmah: sql<number>`count(*)::int` })
      .from(telawaLogTable)
      .where(and(eq(telawaLogTable.userId, userId), eq(telawaLogTable.khatmahId, active.id)));
    const khatmahReads = Number(inKhatmah ?? 0);

    const cursorOffset = khatmahReads % TOTAL_PAGES;
    const nextPage = ((active.startPage - 1 + cursorOffset) % TOTAL_PAGES) + 1;

    const todayStart = startOfTodayUtc(new Date());
    const [{ today }] = await tx
      .select({ today: sql<number>`count(*)::int` })
      .from(telawaLogTable)
      .where(and(eq(telawaLogTable.userId, userId), gte(telawaLogTable.readAt, todayStart)));
    const readToday = Number(today ?? 0);

    const recent = await tx
      .select()
      .from(telawaLogTable)
      .where(and(eq(telawaLogTable.userId, userId), gte(telawaLogTable.readAt, todayStart)))
      .orderBy(desc(telawaLogTable.readAt));

    return {
      pagesPerDay,
      nextPage,
      cycleNumber: active.cycleNumber,
      totalRead,
      readToday,
      khatmah: {
        id: active.id,
        startPage: active.startPage,
        cycleNumber: active.cycleNumber,
        startedAt: active.startedAt.toISOString(),
        readsInKhatmah: khatmahReads,
      },
      upcomingPages: computeUpcoming(nextPage, pagesPerDay),
      recentReads: recent.map((r) => ({
        id: r.id,
        pageNumber: r.pageNumber,
        cycleNumber: r.cycleNumber,
        readAt: r.readAt.toISOString(),
      })),
    };
  });

  return result;
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

  // Wrap khatmah lookup + insert + auto-rollover in a single transaction
  // under the per-user advisory lock so concurrent writes cannot race on
  // khatmah completion.
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${TELAWA_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
    );

    const active = await ensureActiveKhatmah(tx, userId);

    await tx.insert(telawaLogTable).values({
      userId,
      pageNumber: parsed.data.pageNumber,
      cycleNumber: active.cycleNumber,
      khatmahId: active.id,
    });

    const [{ inKhatmah }] = await tx
      .select({ inKhatmah: sql<number>`count(*)::int` })
      .from(telawaLogTable)
      .where(and(eq(telawaLogTable.userId, userId), eq(telawaLogTable.khatmahId, active.id)));
    const khatmahReads = Number(inKhatmah ?? 0);

    if (khatmahReads >= TOTAL_PAGES) {
      // Khatmah complete — close it and auto-open the next one with the
      // same start page so the rotation continues seamlessly.
      await tx
        .update(telawaKhatmahTable)
        .set({ completedAt: new Date() })
        .where(eq(telawaKhatmahTable.id, active.id));
      await tx.insert(telawaKhatmahTable).values({
        userId,
        startPage: active.startPage,
        cycleNumber: active.cycleNumber + 1,
        startedAt: new Date(),
        completedAt: null,
      });
    }
  });

  const today = await buildToday(userId);
  res.json(RecordTelawaReadResponse.parse(today));
});

router.delete("/telawa/read/last", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const undone = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${TELAWA_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
    );

    const [last] = await tx
      .select()
      .from(telawaLogTable)
      .where(eq(telawaLogTable.userId, userId))
      .orderBy(desc(telawaLogTable.readAt), desc(telawaLogTable.id))
      .limit(1);
    if (!last) return false;

    const removedKhatmahId = last.khatmahId;
    await tx.delete(telawaLogTable).where(eq(telawaLogTable.id, last.id));

    // If the removed log belonged to a Khatmah that was just auto-completed
    // by it (i.e. there's a younger empty Khatmah for the same user),
    // delete that empty rollover and reopen the previous one.
    if (removedKhatmahId !== null) {
      const [removedKhatmah] = await tx
        .select()
        .from(telawaKhatmahTable)
        .where(eq(telawaKhatmahTable.id, removedKhatmahId))
        .limit(1);
      if (removedKhatmah && removedKhatmah.completedAt !== null) {
        const [emptyRollover] = await tx
          .select({
            k: telawaKhatmahTable,
            count: sql<number>`(select count(*)::int from ${telawaLogTable} where ${telawaLogTable.khatmahId} = ${telawaKhatmahTable.id})`,
          })
          .from(telawaKhatmahTable)
          .where(
            and(
              eq(telawaKhatmahTable.userId, userId),
              isNull(telawaKhatmahTable.completedAt),
              sql`${telawaKhatmahTable.id} > ${removedKhatmah.id}`,
            ),
          )
          .orderBy(telawaKhatmahTable.id)
          .limit(1);
        if (emptyRollover && Number(emptyRollover.count) === 0) {
          await tx
            .delete(telawaKhatmahTable)
            .where(eq(telawaKhatmahTable.id, emptyRollover.k.id));
          await tx
            .update(telawaKhatmahTable)
            .set({ completedAt: null })
            .where(eq(telawaKhatmahTable.id, removedKhatmah.id));
        }
      }
    }
    return true;
  });

  if (!undone) {
    res.status(404).json({ error: "Nothing to undo" });
    return;
  }
  const today = await buildToday(userId);
  res.json(UndoTelawaReadResponse.parse(today));
});

router.post("/telawa/khatmah", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = StartKhatmahBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const startPage = clampPage(parsed.data.startPage);

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${TELAWA_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
    );
    const active = await ensureActiveKhatmah(tx, userId);

    const [{ inKhatmah }] = await tx
      .select({ inKhatmah: sql<number>`count(*)::int` })
      .from(telawaLogTable)
      .where(and(eq(telawaLogTable.userId, userId), eq(telawaLogTable.khatmahId, active.id)));
    const khatmahReads = Number(inKhatmah ?? 0);

    if (khatmahReads === 0) {
      // No reads yet in the active Khatmah — just retarget its start page.
      await tx
        .update(telawaKhatmahTable)
        .set({ startPage, startedAt: new Date() })
        .where(eq(telawaKhatmahTable.id, active.id));
      return;
    }

    // Close the current Khatmah even if not at 604 — explicit user action.
    await tx
      .update(telawaKhatmahTable)
      .set({ completedAt: new Date() })
      .where(eq(telawaKhatmahTable.id, active.id));
    await tx.insert(telawaKhatmahTable).values({
      userId,
      startPage,
      cycleNumber: active.cycleNumber + 1,
      startedAt: new Date(),
      completedAt: null,
    });
  });

  const today = await buildToday(userId);
  res.json(StartKhatmahResponse.parse(today));
});

router.get("/telawa/stats", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const settings = await getSettings(userId);
  const pagesPerDay = settings.telawaPagesPerDay ?? 5;

  // Make sure the user has an active Khatmah row so the cursor matches /today
  const active = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${TELAWA_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
    );
    return ensureActiveKhatmah(tx, userId);
  });

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(telawaLogTable)
    .where(eq(telawaLogTable.userId, userId));
  const totalRead = Number(total ?? 0);

  const [{ inKhatmah }] = await db
    .select({ inKhatmah: sql<number>`count(*)::int` })
    .from(telawaLogTable)
    .where(and(eq(telawaLogTable.userId, userId), eq(telawaLogTable.khatmahId, active.id)));
  const khatmahReads = Number(inKhatmah ?? 0);
  const cursorOffset = khatmahReads % TOTAL_PAGES;
  const nextPage = ((active.startPage - 1 + cursorOffset) % TOTAL_PAGES) + 1;

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
      currentCycle: active.cycleNumber,
      nextPage,
      pagesPerDay,
      readToday,
      last30Days,
    }),
  );
});

export default router;
