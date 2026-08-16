/**
 * Reward-points helper — awards/revokes points as the user performs the
 * tracked activities. All award functions are non-fatal (they log and
 * swallow errors) because points are a convenience layer on top of the
 * real source-of-truth tables.
 *
 * Idempotency: reward_events has a unique index on
 * (userId, metric, sourceRef). Award paths use ON CONFLICT so re-marks /
 * retries can never double-award. See lib/db/src/schema/rewards.ts for
 * the sourceRef formats.
 *
 * Day keys: memorization flows use the server's LOCAL day (matching
 * auto-assign-page.ts "today"); Telawa flows use the UTC day (matching
 * routes/telawa.ts startOfTodayUtc). Each metric is internally consistent.
 */
import { db, settingsTable, rewardEventsTable, recitationLogTable } from "@workspace/db";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Advisory-lock namespace serializing statusUpgrade ledger writes per
 * (user, page, day). Prevents the read-then-write recompute from racing
 * with a concurrent grade on the same page. "rwup" in hex.
 */
const REWARD_UPGRADE_LOCK_NAMESPACE = 0x72_77_75_70;

export const QUALITY_RANK: Record<string, number> = {
  relearn: 0,
  hard: 1,
  good: 2,
  excellent: 3,
};

export function localDayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function utcDayKey(d: Date = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

async function getPointConfig(userId: string) {
  const [row] = await db
    .select({
      recitation: settingsTable.pointsRecitation,
      statusUpgrade: settingsTable.pointsStatusUpgrade,
      telawaRead: settingsTable.pointsTelawaRead,
      telawaGoal: settingsTable.pointsTelawaGoal,
    })
    .from(settingsTable)
    .where(eq(settingsTable.userId, userId))
    .limit(1);
  return row ?? { recitation: 2, statusUpgrade: 1, telawaRead: 1, telawaGoal: 2 };
}

/**
 * Award points for a page recitation and (if applicable) a status upgrade.
 *
 * @param prevQuality the page's quality BEFORE this recitation was applied.
 *   Only used the FIRST time the page earns upgrade points today — later
 *   corrections recompute from the stored day-baseline (fromQuality).
 * @param newQuality the quality just recorded.
 */
export async function awardRecitationPoints(
  userId: string,
  pageNumber: number,
  prevQuality: string | null,
  newQuality: string,
  when: Date = new Date(),
): Promise<void> {
  try {
    const cfg = await getPointConfig(userId);
    const day = localDayKey(when);
    const sourceRef = `p${pageNumber}:${day}`;

    if (cfg.recitation > 0) {
      await db
        .insert(rewardEventsTable)
        .values({ userId, metric: "recitation", points: cfg.recitation, sourceRef, earnedAt: when })
        .onConflictDoNothing();
    }

    if (cfg.statusUpgrade > 0) {
      await syncUpgradeEvent(userId, sourceRef, prevQuality, newQuality, cfg.statusUpgrade, when);
    }
  } catch (err) {
    logger.warn({ err, userId, pageNumber }, "awardRecitationPoints failed");
  }
}

/**
 * Create/update/delete the statusUpgrade event for one (page, day) under a
 * per-(user, sourceRef) advisory lock so concurrent grades can't race the
 * read-then-write recompute.
 *
 * @param newQuality the day's latest surviving quality, or null to force
 *   deletion of the event (used when the day's last recitation is undone).
 */
async function syncUpgradeEvent(
  userId: string,
  sourceRef: string,
  prevQuality: string | null,
  newQuality: string | null,
  pointsPerLevel: number,
  when: Date,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${REWARD_UPGRADE_LOCK_NAMESPACE}::int, hashtext(${userId + "|" + sourceRef})::int)`,
    );

    const [existing] = await tx
      .select({ id: rewardEventsTable.id, fromQuality: rewardEventsTable.fromQuality })
      .from(rewardEventsTable)
      .where(
        and(
          eq(rewardEventsTable.userId, userId),
          eq(rewardEventsTable.metric, "statusUpgrade"),
          eq(rewardEventsTable.sourceRef, sourceRef),
        ),
      )
      .limit(1);

    const newRank = newQuality !== null ? QUALITY_RANK[newQuality] : undefined;

    if (existing) {
      // Recompute against the stored day-baseline so mid-day corrections
      // adjust rather than stack.
      const baseRank = existing.fromQuality !== null ? QUALITY_RANK[existing.fromQuality] : undefined;
      const levels = baseRank !== undefined && newRank !== undefined ? Math.max(0, newRank - baseRank) : 0;
      if (levels === 0) {
        await tx.delete(rewardEventsTable).where(eq(rewardEventsTable.id, existing.id));
      } else {
        await tx
          .update(rewardEventsTable)
          .set({ points: levels * pointsPerLevel })
          .where(eq(rewardEventsTable.id, existing.id));
      }
    } else {
      if (newRank === undefined) return;
      const baseRank = prevQuality !== null ? QUALITY_RANK[prevQuality] : undefined;
      if (baseRank === undefined) return; // first-ever recitation: no upgrade
      const levels = newRank - baseRank;
      if (levels <= 0) return;
      await tx
        .insert(rewardEventsTable)
        .values({
          userId,
          metric: "statusUpgrade",
          points: levels * pointsPerLevel,
          sourceRef,
          fromQuality: prevQuality,
          earnedAt: when,
        })
        .onConflictDoNothing();
    }
  });
}

/**
 * After an undo deletes a recitation_log row: if NO recitation remains for
 * that page on that (local) day, revoke the day's recitation + upgrade
 * points; if some remain, recompute the upgrade event from the latest
 * surviving quality (an undone later correction must roll points back).
 */
export async function revokeRecitationPointsIfNone(
  userId: string,
  pageNumber: number,
  recitedAt: Date,
): Promise<void> {
  try {
    const dayStart = new Date(recitedAt);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [{ remaining }] = await db
      .select({ remaining: sql<number>`count(*)::int` })
      .from(recitationLogTable)
      .where(
        and(
          eq(recitationLogTable.userId, userId),
          eq(recitationLogTable.pageNumber, pageNumber),
          gte(recitationLogTable.recitedAt, dayStart),
          lt(recitationLogTable.recitedAt, dayEnd),
        ),
      );
    const sourceRef = `p${pageNumber}:${localDayKey(recitedAt)}`;

    if (Number(remaining) > 0) {
      // Some recitations survive — recompute the upgrade event from the
      // latest surviving quality (rolls back an undone correction).
      const [latest] = await db
        .select({ quality: recitationLogTable.quality })
        .from(recitationLogTable)
        .where(
          and(
            eq(recitationLogTable.userId, userId),
            eq(recitationLogTable.pageNumber, pageNumber),
            gte(recitationLogTable.recitedAt, dayStart),
            lt(recitationLogTable.recitedAt, dayEnd),
          ),
        )
        .orderBy(desc(recitationLogTable.recitedAt), desc(recitationLogTable.id))
        .limit(1);
      const cfg = await getPointConfig(userId);
      await syncUpgradeEvent(userId, sourceRef, null, latest?.quality ?? null, cfg.statusUpgrade, recitedAt);
      return;
    }

    await db
      .delete(rewardEventsTable)
      .where(
        and(
          eq(rewardEventsTable.userId, userId),
          eq(rewardEventsTable.sourceRef, sourceRef),
          sql`${rewardEventsTable.metric} in ('recitation', 'statusUpgrade')`,
        ),
      );
  } catch (err) {
    logger.warn({ err, userId, pageNumber }, "revokeRecitationPointsIfNone failed");
  }
}

/** Award points for one Telawa page read (keyed by the telawa_log row id). */
export async function awardTelawaReadPoints(userId: string, telawaLogId: number): Promise<void> {
  try {
    const cfg = await getPointConfig(userId);
    if (cfg.telawaRead <= 0) return;
    await db
      .insert(rewardEventsTable)
      .values({ userId, metric: "telawaRead", points: cfg.telawaRead, sourceRef: `t${telawaLogId}` })
      .onConflictDoNothing();
  } catch (err) {
    logger.warn({ err, userId, telawaLogId }, "awardTelawaReadPoints failed");
  }
}

export async function revokeTelawaReadPoints(userId: string, telawaLogId: number): Promise<void> {
  try {
    await db
      .delete(rewardEventsTable)
      .where(
        and(
          eq(rewardEventsTable.userId, userId),
          eq(rewardEventsTable.metric, "telawaRead"),
          eq(rewardEventsTable.sourceRef, `t${telawaLogId}`),
        ),
      );
  } catch (err) {
    logger.warn({ err, userId, telawaLogId }, "revokeTelawaReadPoints failed");
  }
}

/**
 * Sync the once-per-day Telawa-goal bonus: award when readToday >= goal,
 * revoke when an undo drops the count back below the goal.
 */
export async function syncTelawaGoalPoints(
  userId: string,
  readToday: number,
  goal: number,
): Promise<void> {
  try {
    const cfg = await getPointConfig(userId);
    const sourceRef = `tg:${utcDayKey()}`;
    if (cfg.telawaGoal > 0 && goal > 0 && readToday >= goal) {
      await db
        .insert(rewardEventsTable)
        .values({ userId, metric: "telawaGoal", points: cfg.telawaGoal, sourceRef })
        .onConflictDoNothing();
    } else if (readToday < goal) {
      await db
        .delete(rewardEventsTable)
        .where(
          and(
            eq(rewardEventsTable.userId, userId),
            eq(rewardEventsTable.metric, "telawaGoal"),
            eq(rewardEventsTable.sourceRef, sourceRef),
          ),
        );
    }
  } catch (err) {
    logger.warn({ err, userId }, "syncTelawaGoalPoints failed");
  }
}
