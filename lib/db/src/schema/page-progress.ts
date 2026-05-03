/**
 * page_progress — one row per (user, Mushaf page 1..604) representing the
 * CURRENT memorization state of that page.
 *
 * Mutated by:
 *   - api-server/src/routes/progress.ts (PATCH /progress/pages/:n,
 *     POST /progress/pages/recite-batch, scope add/remove, undo)
 *   - api-server/src/routes/homework.ts (when a homework item is graded)
 *
 * Field semantics:
 *   - inScope:    user has explicitly added this page to their revision plan.
 *                 Pages outside scope appear in lists with status=out_of_scope
 *                 and don't count toward overdue/streak metrics.
 *   - quality:    "excellent" | "good" | "hard" | "relearn" — last reported
 *                 self-assessment. NULL = never recited.
 *   - mistakes:   optional finer-grained count, used by aggregateQuality()
 *                 in lib/progress-helpers.ts to roll up Rub'/Juz averages.
 *   - dueDate:    next-due timestamp, computed by calculateDueDate() from
 *                 lastRecited + the user's per-quality day buffer (settings).
 *   - customName: per-user override of the page's default first-ayah name
 *                 (see lib/page-names.json).
 *
 * Unique key (userId, pageNumber) is enforced by `page_progress_user_page_unique`,
 * so concurrent first-touch inserts will surface as a Postgres unique-violation
 * rather than producing duplicates. `ensurePageExists` performs a select-then-
 * insert without ON CONFLICT — the unique index is the safety net.
 *
 * See docs/business-logic.md → "Page progress & spaced repetition".
 */
import { pgTable, serial, integer, boolean, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const pageProgressTable = pgTable("page_progress", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  pageNumber: integer("page_number").notNull(),
  customName: text("custom_name"),
  inScope: boolean("in_scope").notNull().default(false),
  quality: text("quality"),
  mistakes: integer("mistakes"),
  lastRecited: timestamp("last_recited", { withTimezone: true }),
  dueDate: timestamp("due_date", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  userPageUnique: uniqueIndex("page_progress_user_page_unique").on(table.userId, table.pageNumber),
  userIdx: index("page_progress_user_idx").on(table.userId),
}));

export const insertPageProgressSchema = createInsertSchema(pageProgressTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPageProgress = z.infer<typeof insertPageProgressSchema>;
export type PageProgress = typeof pageProgressTable.$inferSelect;
