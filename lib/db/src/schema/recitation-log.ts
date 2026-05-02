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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("recitation_log_user_idx").on(table.userId),
  userRecitedIdx: index("recitation_log_user_recited_idx").on(table.userId, table.recitedAt),
}));

export const insertRecitationLogSchema = createInsertSchema(recitationLogTable).omit({ id: true, createdAt: true });
export type InsertRecitationLog = z.infer<typeof insertRecitationLogSchema>;
export type RecitationLog = typeof recitationLogTable.$inferSelect;
