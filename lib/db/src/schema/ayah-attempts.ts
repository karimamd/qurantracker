/**
 * ayah_attempts — append-only log of every per-ayah status set in the Reader.
 *
 * Unlike `ayah_mistakes` (which keeps a single active row per ayah+type and
 * just refreshes `recitedAt` when the same mark is re-affirmed), this table
 * records one row for EACH time the user sets a status on an ayah — including
 * re-affirming an existing mark. It exists purely so features can count "how
 * many times was this ayah attempted this week" without losing history to the
 * de-dup / upsert behaviour of ayah_mistakes.
 *
 * Rows are never updated or deleted. `mistakeType` mirrors ayah_mistakes:
 * "memorization" | "link" | "cleared". Removing a mark (toggle-off) is NOT an
 * attempt and is not logged here.
 */
import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ayahAttemptsTable = pgTable("ayah_attempts", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  pageNumber: integer("page_number").notNull(),
  surahNumber: integer("surah_number").notNull(),
  ayahNumberInSurah: integer("ayah_number_in_surah").notNull(),
  globalAyahNumber: integer("global_ayah_number").notNull(),
  mistakeType: text("mistake_type").notNull(),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  userIdx: index("ayah_attempts_user_idx").on(table.userId),
  userAttemptedIdx: index("ayah_attempts_user_attempted_idx").on(table.userId, table.attemptedAt),
  userAyahIdx: index("ayah_attempts_user_ayah_idx").on(table.userId, table.globalAyahNumber),
}));

export const insertAyahAttemptSchema = createInsertSchema(ayahAttemptsTable).omit({ id: true, createdAt: true });
export type InsertAyahAttempt = z.infer<typeof insertAyahAttemptSchema>;
export type AyahAttempt = typeof ayahAttemptsTable.$inferSelect;
