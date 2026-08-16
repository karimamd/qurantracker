/**
 * Reward system tables.
 *
 * reward_events — append-only(ish) points ledger of EARNED points. Each row
 * is keyed by (userId, metric, sourceRef) so awarding is idempotent: the
 * same source action (e.g. "page 12 recited on 2026-08-16") can never
 * double-award. `sourceRef` encodes the source:
 *   - recitation:     "p<page>:<YYYY-MM-DD>"  (one per unique page per day)
 *   - statusUpgrade:  "p<page>:<YYYY-MM-DD>"  (fromQuality stores the day's
 *                     baseline quality; mid-day corrections UPDATE points)
 *   - telawaRead:     "t<telawaLogId>"        (one per read; undo deletes)
 *   - telawaGoal:     "tg:<YYYY-MM-DD>"       (once per day when goal met)
 * Points may be updated or the row deleted when the source action is
 * corrected/undone — the ledger mirrors the source-of-truth tables.
 *
 * reward_prizes — user-defined prizes with a point cost.
 * reward_redemptions — history of collected prizes (spent points). Balance
 * = SUM(reward_events.points) - SUM(reward_redemptions.cost).
 */
import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rewardEventsTable = pgTable("reward_events", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  // "recitation" | "statusUpgrade" | "telawaRead" | "telawaGoal"
  metric: text("metric").notNull(),
  points: integer("points").notNull(),
  sourceRef: text("source_ref").notNull(),
  // For statusUpgrade: the page quality BEFORE the day's first recitation,
  // so mid-day quality corrections recompute levels from the same baseline.
  fromQuality: text("from_quality"),
  earnedAt: timestamp("earned_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userMetricSourceUnique: uniqueIndex("reward_events_user_metric_source_unique").on(table.userId, table.metric, table.sourceRef),
  userIdx: index("reward_events_user_idx").on(table.userId),
  userEarnedIdx: index("reward_events_user_earned_idx").on(table.userId, table.earnedAt),
}));

export const rewardPrizesTable = pgTable("reward_prizes", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  cost: integer("cost").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("reward_prizes_user_idx").on(table.userId),
}));

export const rewardRedemptionsTable = pgTable("reward_redemptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  // Snapshot of the prize at redemption time (prize may be edited/deleted later).
  prizeId: integer("prize_id"),
  prizeName: text("prize_name").notNull(),
  cost: integer("cost").notNull(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("reward_redemptions_user_idx").on(table.userId),
}));

export const insertRewardEventSchema = createInsertSchema(rewardEventsTable).omit({ id: true, createdAt: true });
export type InsertRewardEvent = z.infer<typeof insertRewardEventSchema>;
export type RewardEvent = typeof rewardEventsTable.$inferSelect;
export type RewardPrize = typeof rewardPrizesTable.$inferSelect;
export type RewardRedemption = typeof rewardRedemptionsTable.$inferSelect;
