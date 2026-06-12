/**
 * telawa_scope_cycle / telawa_scope_log — the "In-Scope Round-Robin" reading
 * track.
 *
 * This is a lightweight reading goal that is INDEPENDENT of the full-Quran
 * Khatmah subsystem (telawa_khatmah / telawa_log). Instead of walking the
 * Mushaf 1→604, it cycles through only the pages currently in the user's
 * memorization scope (page_progress.in_scope = true), with a daily page goal.
 * When every in-scope page has been covered in a cycle, the cycle auto-
 * completes and the next one opens.
 *
 * A page counts as "read this cycle" when EITHER the user explicitly marks it
 * read here (a telawa_scope_log row for the active cycle) OR they record any
 * quality recitation (recitation_log) since the cycle started — "either one
 * counts". Only the explicit reads live in telawa_scope_log; the recitation
 * credit is computed at read time against recitation_log.
 *
 * One user has at most one ACTIVE cycle at a time (`completedAt IS NULL`).
 * See routes/telawa-scope.ts for the lifecycle endpoints.
 */
import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const telawaScopeCycleTable = pgTable("telawa_scope_cycle", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  cycleNumber: integer("cycle_number").notNull().default(1),
  // Per-cycle daily page goal. NULL = inherit from settings.telawaPagesPerDay.
  pagesPerDay: integer("pages_per_day"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  userIdx: index("telawa_scope_cycle_user_idx").on(table.userId),
  userActiveIdx: index("telawa_scope_cycle_user_active_idx").on(table.userId, table.completedAt),
}));

export const telawaScopeLogTable = pgTable("telawa_scope_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  pageNumber: integer("page_number").notNull(),
  cycleNumber: integer("cycle_number").notNull().default(1),
  // Cycle this explicit read belongs to. Nullable only for resilience; the
  // route always sets it to the active cycle's id.
  cycleId: integer("cycle_id"),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("telawa_scope_log_user_idx").on(table.userId),
  userReadIdx: index("telawa_scope_log_user_read_idx").on(table.userId, table.readAt),
  cycleIdx: index("telawa_scope_log_cycle_idx").on(table.cycleId),
}));

export const insertTelawaScopeCycleSchema = createInsertSchema(telawaScopeCycleTable).omit({ id: true });
export type InsertTelawaScopeCycle = z.infer<typeof insertTelawaScopeCycleSchema>;
export type TelawaScopeCycle = typeof telawaScopeCycleTable.$inferSelect;

export const insertTelawaScopeLogSchema = createInsertSchema(telawaScopeLogTable).omit({ id: true, createdAt: true });
export type InsertTelawaScopeLog = z.infer<typeof insertTelawaScopeLogSchema>;
export type TelawaScopeLog = typeof telawaScopeLogTable.$inferSelect;
