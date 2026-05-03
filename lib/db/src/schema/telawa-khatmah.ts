/**
 * telawa_khatmah — header row for one full read-through of the Quran.
 *
 * One user has at most one ACTIVE Khatmah at a time (`completedAt IS NULL`).
 * Starting a new one closes the previous active one. `startPage` lets users
 * begin at the page they're currently on rather than always at page 1 —
 * the linear progress UI in pages/telawa.tsx visualizes the "skipped"
 * leading section in amber so the cursor position remains intuitive.
 *
 * See routes/telawa.ts for the Khatmah lifecycle endpoints and
 * lib/db/src/schema/telawa.ts for the per-page log rows.
 */
import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const telawaKhatmahTable = pgTable("telawa_khatmah", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  startPage: integer("start_page").notNull(),
  cycleNumber: integer("cycle_number").notNull().default(1),
  // Per-Khatmah daily page goal. NULL = inherit from settings.telawaPagesPerDay.
  pagesPerDay: integer("pages_per_day"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  userIdx: index("telawa_khatmah_user_idx").on(table.userId),
  userActiveIdx: index("telawa_khatmah_user_active_idx").on(table.userId, table.completedAt),
}));

export const insertTelawaKhatmahSchema = createInsertSchema(telawaKhatmahTable).omit({ id: true });
export type InsertTelawaKhatmah = z.infer<typeof insertTelawaKhatmahSchema>;
export type TelawaKhatmah = typeof telawaKhatmahTable.$inferSelect;
