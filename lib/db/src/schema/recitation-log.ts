import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recitationLogTable = pgTable("recitation_log", {
  id: serial("id").primaryKey(),
  pageNumber: integer("page_number").notNull(),
  quality: text("quality").notNull(),
  mistakes: integer("mistakes"),
  recitedAt: timestamp("recited_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRecitationLogSchema = createInsertSchema(recitationLogTable).omit({ id: true, createdAt: true });
export type InsertRecitationLog = z.infer<typeof insertRecitationLogSchema>;
export type RecitationLog = typeof recitationLogTable.$inferSelect;
