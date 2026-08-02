/**
 * homework — teacher-style assignments grouping pages a student must
 * either MEMORIZE (new material) or REVISE (existing memorization) by
 * a chosen due date.
 *
 * Two tables:
 *   - homework_sessions — the assignment header (title + dueDate)
 *   - homework_items    — pages within an assignment, each with type
 *                         "memorize" | "revise" and a denormalized
 *                         completion flag/quality
 *
 * Cross-table coupling owned by api-server/src/routes/homework.ts:
 *   - Grading a homework item ALSO writes to page_progress + recitation_log
 *     so progress dashboards stay in sync (homework grading IS a recitation).
 *   - Conversely, the undo path in routes/progress.ts re-derives the
 *     `completed` flag for active sessions whenever a recitation is undone.
 *
 * "Overdue" is whole-day based: an assignment is only overdue once the
 * entire dueDate calendar day has passed (see isHomeworkOverdue helper).
 */
import { pgTable, serial, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const homeworkSessionsTable = pgTable("homework_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  /**
   * Optional ayah-level boundary for this homework.  When set, only ayahs
   * with globalAyahNumber in [firstGlobalAyah, lastGlobalAyah] are counted
   * in the per-ayah correctness views.  Pages always use the ceiling rule
   * (full page included if any boundary ayah lives on it).
   */
  firstGlobalAyah: integer("first_global_ayah"),
  lastGlobalAyah: integer("last_global_ayah"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  userIdx: index("homework_sessions_user_idx").on(table.userId),
}));

export const insertHomeworkSessionSchema = createInsertSchema(homeworkSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertHomeworkSession = z.infer<typeof insertHomeworkSessionSchema>;
export type HomeworkSession = typeof homeworkSessionsTable.$inferSelect;

export const homeworkItemsTable = pgTable("homework_items", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  homeworkId: integer("homework_id").notNull(),
  pageNumber: integer("page_number").notNull(),
  type: text("type").notNull(),
  completed: boolean("completed").notNull().default(false),
  quality: text("quality"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("homework_items_user_idx").on(table.userId),
  homeworkIdx: index("homework_items_homework_idx").on(table.homeworkId),
}));

export const insertHomeworkItemSchema = createInsertSchema(homeworkItemsTable).omit({ id: true, createdAt: true });
export type InsertHomeworkItem = z.infer<typeof insertHomeworkItemSchema>;
export type HomeworkItem = typeof homeworkItemsTable.$inferSelect;
