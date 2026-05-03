/**
 * settings — one row per user holding their personal preferences.
 *
 * Created lazily by getSettings() in lib/progress-helpers.ts the first time
 * a user touches a settings-aware endpoint, so there is no separate signup
 * hook. The defaults below are also the defaults a brand-new account sees.
 *
 * Fields:
 *   - {excellent,good,hard,relearn}Days — spaced-repetition day buffers fed
 *     into calculateDueDate(); editable via PATCH /api/settings.
 *   - language — "en" | "ar"; mirrored into the i18n runtime by App.tsx
 *     (LanguageSync) so it sticks across devices.
 *   - telawaPagesPerDay — default daily Khatmah page goal; can be overridden
 *     per active Khatmah via telawa_khatmah.pages_per_day (NULL = inherit).
 */
import { sql } from "drizzle-orm";
import { pgTable, serial, integer, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  excellentDays: integer("excellent_days").notNull().default(30),
  goodDays: integer("good_days").notNull().default(14),
  hardDays: integer("hard_days").notNull().default(7),
  relearnDays: integer("relearn_days").notNull().default(3),
  language: text("language").notNull().default("en"),
  telawaPagesPerDay: integer("telawa_pages_per_day").notNull().default(5),
  // Font size in pixels for the Quran page text in the Reader. Persisted
  // per user so adjustments stick across devices. Bounded client-side to
  // keep page text readable and avoid extreme layouts.
  readerFontSize: integer("reader_font_size").notNull().default(24),
  // Default font size in pixels for the single-ayah detail page on the
  // /ayahs route. Tracked separately from readerFontSize so the user can
  // browse the full Mushaf page at one size and study a single ayah at a
  // larger one without thrashing the other view's preference.
  ayahViewFontSize: integer("ayah_view_font_size").notNull().default(40),
  // Ordered list of nav-item keys to show in the mobile bottom-tab bar.
  // The Layout component reads this and falls back to the historical
  // five (homework, dashboard, telawa, reader, mistakes) when the array
  // is empty or contains only unknown keys. Server-side validation
  // (see api-spec) restricts entries to the allowed enum and caps
  // length at 5 so the bar stays tappable on small phones.
  bottomNavKeys: text("bottom_nav_keys")
    .array()
    .notNull()
    .default(sql`ARRAY['homework','dashboard','telawa','reader','mistakes']::text[]`),
}, (table) => ({
  userIdUnique: uniqueIndex("settings_user_id_unique").on(table.userId),
}));

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
