/**
 * telawa_log — append-only log of every page READ during a Khatmah cycle.
 *
 * Telawa ("recitation as worship") is separate from memorization revision:
 * it tracks linear page-by-page reads through the Mushaf (1→604, then
 * looping back to 1 for the next cycle). The cursor for "what page is next"
 * is computed by counting telawa_log rows in the active Khatmah — that's
 * why the active-mistake/cursor mutations in routes/telawa.ts run inside
 * advisory-locked transactions (counting rows is otherwise racy).
 *
 * See lib/db/src/schema/telawa-khatmah.ts for the Khatmah header table and
 * docs/business-logic.md → "Telawa & Khatmah".
 */
import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const telawaLogTable = pgTable("telawa_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  pageNumber: integer("page_number").notNull(),
  cycleNumber: integer("cycle_number").notNull().default(1),
  // Nullable for backwards compatibility with rows recorded before
  // the Khatmah model existed; backfilled lazily on first read.
  khatmahId: integer("khatmah_id"),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("telawa_log_user_idx").on(table.userId),
  userReadIdx: index("telawa_log_user_read_idx").on(table.userId, table.readAt),
  khatmahIdx: index("telawa_log_khatmah_idx").on(table.khatmahId),
}));

export const insertTelawaLogSchema = createInsertSchema(telawaLogTable).omit({ id: true, createdAt: true });
export type InsertTelawaLog = z.infer<typeof insertTelawaLogSchema>;
export type TelawaLog = typeof telawaLogTable.$inferSelect;
