import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const telawaKhatmahTable = pgTable("telawa_khatmah", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  startPage: integer("start_page").notNull(),
  cycleNumber: integer("cycle_number").notNull().default(1),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  userIdx: index("telawa_khatmah_user_idx").on(table.userId),
  userActiveIdx: index("telawa_khatmah_user_active_idx").on(table.userId, table.completedAt),
}));

export const insertTelawaKhatmahSchema = createInsertSchema(telawaKhatmahTable).omit({ id: true });
export type InsertTelawaKhatmah = z.infer<typeof insertTelawaKhatmahSchema>;
export type TelawaKhatmah = typeof telawaKhatmahTable.$inferSelect;
