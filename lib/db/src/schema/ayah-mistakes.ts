/**
 * ayah_mistakes — append-only log of per-ayah error marks made in the Reader.
 *
 * Two `mistakeType`s, both surfaced in the Reader's tap-to-mark UI and on the
 * /mistakes page:
 *   - "memorization" → user blanked / forgot the ayah's text
 *   - "link"         → user knew the ayah but stumbled on the transition
 *                      from the previous one
 *
 * Resolution model: rows are NOT deleted when a mistake is "fixed". Instead
 * `resolvedAt` is stamped, leaving the row available for any future
 * historical reporting. Today every read path (the per-page active list,
 * the GET /progress/mistakes feed used by pages/mistakes.tsx, and the
 * resolve mutation) filters on `resolvedAt IS NULL`, so the table is
 * effectively used as the "currently unresolved" set. See routes/progress.ts
 * active-mistakes endpoints (advisory-locked to prevent duplicate inserts
 * on rapid toggles).
 *
 * `globalAyahNumber` (1..6236) is the canonical de-dup key — (surah, ayah)
 * pairs alone aren't sufficient because the same surah-ayah could plausibly
 * appear twice during transcription pipelines.
 */
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
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("ayah_mistakes_user_idx").on(table.userId),
  userRecitedIdx: index("ayah_mistakes_user_recited_idx").on(table.userId, table.recitedAt),
  userPageIdx: index("ayah_mistakes_user_page_idx").on(table.userId, table.pageNumber),
  userPageResolvedIdx: index("ayah_mistakes_user_page_resolved_idx").on(
    table.userId,
    table.pageNumber,
    table.resolvedAt,
  ),
}));

export const insertAyahMistakeSchema = createInsertSchema(ayahMistakesTable).omit({ id: true, createdAt: true });
export type InsertAyahMistake = z.infer<typeof insertAyahMistakeSchema>;
export type AyahMistake = typeof ayahMistakesTable.$inferSelect;
