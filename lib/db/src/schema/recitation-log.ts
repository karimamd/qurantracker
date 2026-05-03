/**
 * recitation_log — append-only history of every page recitation. The
 * authoritative source for streaks, the daily/progress charts, the recent
 * activity feed, and the undo-recitation flow.
 *
 * Each insert pairs with an UPDATE on page_progress (current state). On
 * undo, page_progress is restored from the next-most-recent row here for
 * the same page — see DELETE /progress/activity/:id in routes/progress.ts
 * for the locking + recompute logic.
 */
import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recitationLogTable = pgTable("recitation_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  pageNumber: integer("page_number").notNull(),
  quality: text("quality").notNull(),
  mistakes: integer("mistakes"),
  recitedAt: timestamp("recited_at", { withTimezone: true }).notNull().defaultNow(),
  // The due date assigned to the page at the moment this log was recorded.
  // Used by /progress/activity/:id DELETE (undo) to restore the page's
  // previous due date verbatim — important when the user later changes their
  // day-buffer settings between recitations. Nullable for backward compat
  // with rows recorded before this column existed.
  dueDate: timestamp("due_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("recitation_log_user_idx").on(table.userId),
  userRecitedIdx: index("recitation_log_user_recited_idx").on(table.userId, table.recitedAt),
}));

export const insertRecitationLogSchema = createInsertSchema(recitationLogTable).omit({ id: true, createdAt: true });
export type InsertRecitationLog = z.infer<typeof insertRecitationLogSchema>;
export type RecitationLog = typeof recitationLogTable.$inferSelect;
