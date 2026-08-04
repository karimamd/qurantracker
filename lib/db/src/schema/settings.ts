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
import { pgTable, serial, integer, text, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  excellentDays: integer("excellent_days").notNull().default(30),
  goodDays: integer("good_days").notNull().default(14),
  hardDays: integer("hard_days").notNull().default(7),
  relearnDays: integer("relearn_days").notNull().default(3),
  language: text("language").notNull().default("ar"),
  telawaPagesPerDay: integer("telawa_pages_per_day").notNull().default(5),
  // Font size in pixels for the Quran page text in the Reader. Persisted
  // per user so adjustments stick across devices. Bounded client-side to
  // keep page text readable and avoid extreme layouts.
  readerFontSize: integer("reader_font_size").notNull().default(32),
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
  // When true, every time a per-ayah mark is added/removed from the Reader
  // or the Ayah view, the server checks if EVERY ayah on that page has been
  // marked TODAY (cleared or one/two mistake types). If it has, the server
  // computes the page's quality from the day's mistake total using the
  // mistakesGoodMax / mistakesHardMax thresholds below and records a new
  // recitation_log row — but only if the resulting quality differs from
  // any recitation already logged today for that page (no duplicate logs
  // when toggling marks back and forth). Default off so existing users
  // don't see surprise auto-recordings after deploy.
  autoAssignPageFromAyahs: boolean("auto_assign_page_from_ayahs").notNull().default(false),
  // Inclusive upper bound on total active page mistakes that still maps to
  // "good"; 0 always maps to "excellent". Anything above mistakesHardMax
  // maps to "relearn". The two thresholds together fully define the
  // 4-bucket excellent/good/hard/relearn ladder used by the auto-assign
  // feature above. Defaults match the spec: Good ≤ 2, Hard ≤ 6.
  mistakesGoodMax: integer("mistakes_good_max").notNull().default(2),
  mistakesHardMax: integer("mistakes_hard_max").notNull().default(6),
  // When true, per-ayah marks (cleared / memorization / link) whose
  // `created_at` is older than 14 days are excluded from the "active" list
  // that the Reader and Ayah-detail screens display. The marks remain in the
  // DB for analytics; only the live view is filtered. Page recitation status
  // (page_progress / recitation_log) is never affected. Default off.
  autoExpireAyahMarks: boolean("auto_expire_ayah_marks").notNull().default(false),
  // Global weekly per-page read target for Homework pages. A homework page's
  // weekly progress counts BOTH quality recitations (recitation_log) and
  // explicit Telawa reads (telawa_log / telawa_scope_log) within the trailing
  // 7-day window. Used by the Homework Reading goal card and the per-page
  // progress bars on the homework detail screen.
  homeworkWeeklyReadGoal: integer("homework_weekly_read_goal").notNull().default(3),
  // Controls the default expand/collapse state for the "Pages Requiring
  // Attention" surah groups on the Dashboard. When true (default), all surah
  // groups start collapsed and the user expands the one they want to work on.
  // When false, all groups start expanded (previous behavior). The user can
  // always toggle individual groups; this only sets the initial state on load.
  duePagesSectionCollapsed: boolean("due_pages_section_collapsed").notNull().default(true),
  // When true (default), opening the Reader from the Dashboard "Pages
  // Requiring Attention" section or from the Homework screen automatically
  // enters hide/practice mode so the user must reveal each ayah one at a
  // time rather than seeing the full page immediately.
  hideReaderOnJump: boolean("hide_reader_on_jump").notNull().default(true),
}, (table) => ({
  userIdUnique: uniqueIndex("settings_user_id_unique").on(table.userId),
}));

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({ id: true });
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
