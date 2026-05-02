import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ayahMistakesTable = pgTable("ayah_mistakes", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  pageNumber: integer("page_number").notNull(),
  surahNumber: integer("surah_number").notNull(),
  ayahNumberInSurah: integer("ayah_number_in_surah").notNull(),
  globalAyahNumber: integer("global_ayah_number").notNull(),
  mistakeType: text("mistake_type").notNull(),
  recitedAt: timestamp("recited_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("ayah_mistakes_user_idx").on(table.userId),
  userRecitedIdx: index("ayah_mistakes_user_recited_idx").on(table.userId, table.recitedAt),
  userPageIdx: index("ayah_mistakes_user_page_idx").on(table.userId, table.pageNumber),
}));

export const insertAyahMistakeSchema = createInsertSchema(ayahMistakesTable).omit({ id: true, createdAt: true });
export type InsertAyahMistake = z.infer<typeof insertAyahMistakeSchema>;
export type AyahMistake = typeof ayahMistakesTable.$inferSelect;
