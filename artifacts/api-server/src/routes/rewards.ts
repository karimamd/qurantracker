/**
 * /api/rewards/* — reward points, prizes, and redemptions.
 *
 * Points are EARNED automatically by hooks in progress/homework/telawa
 * routes (see lib/rewards.ts) and SPENT by redeeming prizes here.
 * Balance = SUM(reward_events.points) - SUM(reward_redemptions.cost).
 *
 * Redemption runs in a transaction under a per-user advisory lock so two
 * simultaneous redeems can't both pass the balance check.
 */
import { Router, type IRouter } from "express";
import { db, rewardEventsTable, rewardPrizesTable, rewardRedemptionsTable } from "@workspace/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  GetRewardsSummaryResponse,
  ListRewardPrizesResponse,
  CreateRewardPrizeBody,
  ListRewardPrizesResponseItem,
  UpdateRewardPrizeParams,
  UpdateRewardPrizeBody,
  UpdateRewardPrizeResponse,
  DeleteRewardPrizeParams,
  RedeemRewardPrizeParams,
  RedeemRewardPrizeResponse,
  ListRewardRedemptionsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

const REWARDS_LOCK_NAMESPACE = 0x72_77_64_73; // "rwds"

async function computeBalance(userId: string): Promise<{ earned: number; spent: number; balance: number }> {
  const [{ earned }] = await db
    .select({ earned: sql<number>`coalesce(sum(${rewardEventsTable.points}), 0)::int` })
    .from(rewardEventsTable)
    .where(eq(rewardEventsTable.userId, userId));
  const [{ spent }] = await db
    .select({ spent: sql<number>`coalesce(sum(${rewardRedemptionsTable.cost}), 0)::int` })
    .from(rewardRedemptionsTable)
    .where(eq(rewardRedemptionsTable.userId, userId));
  return { earned: Number(earned), spent: Number(spent), balance: Number(earned) - Number(spent) };
}

router.get("/rewards/summary", async (req, res): Promise<void> => {
  const userId = req.userId!;

  const { earned, spent, balance } = await computeBalance(userId);

  // Daily earned points for the last 14 local days.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const since = new Date(todayStart);
  since.setDate(since.getDate() - 13);

  const dailyRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${rewardEventsTable.earnedAt}), 'YYYY-MM-DD')`,
      points: sql<number>`sum(${rewardEventsTable.points})::int`,
    })
    .from(rewardEventsTable)
    .where(and(eq(rewardEventsTable.userId, userId), gte(rewardEventsTable.earnedAt, since)))
    .groupBy(sql`date_trunc('day', ${rewardEventsTable.earnedAt})`);
  const dailyMap = new Map(dailyRows.map(r => [r.day, Number(r.points)]));

  const dailyPoints: Array<{ date: string; points: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dailyPoints.push({ date: key, points: dailyMap.get(key) ?? 0 });
  }
  const todayPoints = dailyPoints[dailyPoints.length - 1]?.points ?? 0;
  const bestDayPoints = Math.max(0, ...dailyPoints.map(d => d.points));

  // Earnings breakdown by metric over the last 30 days.
  const breakdownSince = new Date(todayStart);
  breakdownSince.setDate(breakdownSince.getDate() - 29);
  const byMetricRows = await db
    .select({
      metric: rewardEventsTable.metric,
      points: sql<number>`sum(${rewardEventsTable.points})::int`,
    })
    .from(rewardEventsTable)
    .where(and(eq(rewardEventsTable.userId, userId), gte(rewardEventsTable.earnedAt, breakdownSince)))
    .groupBy(rewardEventsTable.metric);

  res.json(
    GetRewardsSummaryResponse.parse({
      balance,
      totalEarned: earned,
      totalSpent: spent,
      todayPoints,
      bestDayPoints,
      dailyPoints,
      byMetric: byMetricRows.map(r => ({ metric: r.metric, points: Number(r.points) })),
    }),
  );
});

router.get("/rewards/prizes", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const prizes = await db
    .select()
    .from(rewardPrizesTable)
    .where(eq(rewardPrizesTable.userId, userId))
    .orderBy(rewardPrizesTable.cost, rewardPrizesTable.id);
  res.json(ListRewardPrizesResponse.parse(prizes));
});

router.post("/rewards/prizes", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreateRewardPrizeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(rewardPrizesTable)
    .values({ userId, name: parsed.data.name.trim(), cost: parsed.data.cost })
    .returning();
  res.status(201).json(ListRewardPrizesResponseItem.parse(created));
});

router.patch("/rewards/prizes/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = UpdateRewardPrizeParams.safeParse(req.params);
  const parsed = UpdateRewardPrizeBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: (params.success ? parsed.error?.message : params.error.message) ?? "Invalid request" });
    return;
  }
  const patch: Partial<typeof rewardPrizesTable.$inferInsert> = {};
  if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim();
  if (parsed.data.cost !== undefined) patch.cost = parsed.data.cost;
  const [updated] = await db
    .update(rewardPrizesTable)
    .set(patch)
    .where(and(eq(rewardPrizesTable.userId, userId), eq(rewardPrizesTable.id, params.data.id)))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Prize not found" });
    return;
  }
  res.json(UpdateRewardPrizeResponse.parse(updated));
});

router.delete("/rewards/prizes/:id", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = DeleteRewardPrizeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const deleted = await db
    .delete(rewardPrizesTable)
    .where(and(eq(rewardPrizesTable.userId, userId), eq(rewardPrizesTable.id, params.data.id)))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Prize not found" });
    return;
  }
  res.status(204).send();
});

router.post("/rewards/prizes/:id/redeem", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = RedeemRewardPrizeParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${REWARDS_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
    );

    const [prize] = await tx
      .select()
      .from(rewardPrizesTable)
      .where(and(eq(rewardPrizesTable.userId, userId), eq(rewardPrizesTable.id, params.data.id)))
      .limit(1);
    if (!prize) return { status: 404 as const };

    const [{ earned }] = await tx
      .select({ earned: sql<number>`coalesce(sum(${rewardEventsTable.points}), 0)::int` })
      .from(rewardEventsTable)
      .where(eq(rewardEventsTable.userId, userId));
    const [{ spent }] = await tx
      .select({ spent: sql<number>`coalesce(sum(${rewardRedemptionsTable.cost}), 0)::int` })
      .from(rewardRedemptionsTable)
      .where(eq(rewardRedemptionsTable.userId, userId));
    const balance = Number(earned) - Number(spent);
    if (balance < prize.cost) return { status: 400 as const, balance };

    const [redemption] = await tx
      .insert(rewardRedemptionsTable)
      .values({ userId, prizeId: prize.id, prizeName: prize.name, cost: prize.cost })
      .returning();
    return { status: 200 as const, redemption, balance: balance - prize.cost };
  });

  if (result.status === 404) {
    res.status(404).json({ error: "Prize not found" });
    return;
  }
  if (result.status === 400) {
    res.status(400).json({ error: "insufficient_points" });
    return;
  }
  res.json(RedeemRewardPrizeResponse.parse({ redemption: result.redemption, balance: result.balance }));
});

router.get("/rewards/redemptions", async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(rewardRedemptionsTable)
    .where(eq(rewardRedemptionsTable.userId, userId))
    .orderBy(desc(rewardRedemptionsTable.redeemedAt))
    .limit(50);
  res.json(ListRewardRedemptionsResponse.parse(rows));
});

export default router;
