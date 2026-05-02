import { pgTable, serial, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const homeworkSessionsTable = pgTable("homework_sessions", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  title: text("title").notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
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
