import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const telawaLogTable = pgTable("telawa_log", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  pageNumber: integer("page_number").notNull(),
  cycleNumber: integer("cycle_number").notNull().default(1),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("telawa_log_user_idx").on(table.userId),
  userReadIdx: index("telawa_log_user_read_idx").on(table.userId, table.readAt),
}));

export const insertTelawaLogSchema = createInsertSchema(telawaLogTable).omit({ id: true, createdAt: true });
export type InsertTelawaLog = z.infer<typeof insertTelawaLogSchema>;
export type TelawaLog = typeof telawaLogTable.$inferSelect;
