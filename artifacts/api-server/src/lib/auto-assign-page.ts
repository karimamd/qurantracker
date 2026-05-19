/**
 * Auto-assign-page-recitation helper.
 *
 * When the user has settings.autoAssignPageFromAyahs = true, every successful
 * mutation against the per-ayah active-mistakes endpoints calls
 * `maybeAutoAssignPageRecitation(userId, pageNumber)` AFTER its own
 * transaction commits. The helper walks the per-page invariant:
 *
 *   1. Every ayah on the Mushaf page must have at least one currently-
 *      active mark (resolvedAt IS NULL) whose recitedAt falls within the
 *      server's local "today" window. Cleared ticks count as "marked".
 *   2. Total mistakes for the page = number of currently-active rows of
 *      type memorization|link across all ayahs on the page (cleared rows
 *      contribute zero). Each ayah can hold at most {one cleared} XOR
 *      {one memorization, one link} (enforced by the active-mistakes POST
 *      handler), so the count is bounded by 2 × ayahsOnPage.
 *   3. Bucket the total into a quality using the user's
 *      mistakesGoodMax / mistakesHardMax thresholds (excellent==0,
 *      good ≤ goodMax, hard ≤ hardMax, otherwise relearn).
 *   4. Compare against the most recent recitation_log row recorded TODAY
 *      for the same page. If one exists with the same quality → noop
 *      (the user is just toggling marks back and forth without changing
 *      the page's verdict). Otherwise insert a fresh recitation_log row
 *      and update page_progress so dashboards reflect the new state.
 *
 * The helper is intentionally side-effect-only (returns void). It is
 * called outside the active-mistakes transaction so a failure here cannot
 * roll back the user's actual mark; it just logs a warning. The
 * underlying writes are themselves wrapped in their own transaction with
 * a per-user advisory lock to prevent two near-simultaneous mutations
 * from racing into duplicate auto-recordings.
 */
import { db, settingsTable, pageProgressTable, recitationLogTable, ayahMistakesTable } from "@workspace/db";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import pageAyahsData from "./page-ayahs.json" with { type: "json" };
import { calculateDueDate, ensurePageExists } from "./progress-helpers";
import { logger } from "./logger";

const PAGE_AYAHS = pageAyahsData as Record<string, number[]>;

// Same advisory-lock namespace family as ACTIVE_MISTAKE_LOCK_NAMESPACE
// in routes/progress.ts but a distinct integer so we can hold both at
// once without deadlocking. (The active-mistake handler releases its
// lock at COMMIT before this helper runs.)
// Must fit in Postgres int4 (signed 32-bit, max 2147483647). Postgres'
// `pg_advisory_xact_lock(int, int)` overload rejects values outside that
// range. The original value `0x9a91_0001` overflowed; the trimmed
// constant below stays well inside int4 and remains distinct from
// ACTIVE_MISTAKE_LOCK_NAMESPACE so a single transaction can't deadlock
// against itself if it ever needs both locks.
const AUTO_ASSIGN_LOCK_NAMESPACE = 0x1a91_0001;

export function getGlobalAyahsForPage(pageNumber: number): number[] {
  return PAGE_AYAHS[String(pageNumber)] ?? [];
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfTomorrow(): Date {
  const d = startOfToday();
  d.setDate(d.getDate() + 1);
  return d;
}

export function bucketQuality(
  totalMistakes: number,
  goodMax: number,
  hardMax: number,
): "excellent" | "good" | "hard" | "relearn" {
  if (totalMistakes <= 0) return "excellent";
  // Defensive: if a saved hardMax somehow ended up below goodMax (e.g.
  // an older backup before the UI's ordering check shipped) treat the
  // larger of the two as the hard cap so we never silently skip a
  // bucket. The settings UI also rejects this on save.
  const effectiveHardMax = Math.max(goodMax, hardMax);
  if (totalMistakes <= goodMax) return "good";
  if (totalMistakes <= effectiveHardMax) return "hard";
  return "relearn";
}

export async function maybeAutoAssignPageRecitation(
  userId: string,
  pageNumber: number,
): Promise<void> {
  try {
    const ayahsOnPage = getGlobalAyahsForPage(pageNumber);
    if (ayahsOnPage.length === 0) return;

    // Read settings inline rather than calling getSettings() to avoid
    // accidentally creating a row from a background path.
    const [settings] = await db
      .select({
        autoAssign: settingsTable.autoAssignPageFromAyahs,
        goodMax: settingsTable.mistakesGoodMax,
        hardMax: settingsTable.mistakesHardMax,
        excellentDays: settingsTable.excellentDays,
        goodDays: settingsTable.goodDays,
        hardDays: settingsTable.hardDays,
        relearnDays: settingsTable.relearnDays,
      })
      .from(settingsTable)
      .where(eq(settingsTable.userId, userId))
      .limit(1);
    if (!settings || !settings.autoAssign) return;

    const dayStart = startOfToday();
    const dayEnd = startOfTomorrow();

    // Coverage check: every ayah on the page must have at least one
    // currently-active mark placed TODAY (bounded [dayStart, dayEnd) to
    // exclude future-dated rows from bad clocks or imports).
    const todayCoverageMarks = await db
      .select({ globalAyahNumber: ayahMistakesTable.globalAyahNumber })
      .from(ayahMistakesTable)
      .where(
        and(
          eq(ayahMistakesTable.userId, userId),
          eq(ayahMistakesTable.pageNumber, pageNumber),
          sql`${ayahMistakesTable.resolvedAt} is null`,
          gte(ayahMistakesTable.recitedAt, dayStart),
          lt(ayahMistakesTable.recitedAt, dayEnd),
          inArray(ayahMistakesTable.mistakeType, ["cleared", "memorization", "link"]),
        ),
      );

    const covered = new Set<number>(todayCoverageMarks.map((m) => m.globalAyahNumber));
    for (const g of ayahsOnPage) {
      if (!covered.has(g)) return;
    }

    // Mistakes count: ALL currently-active memorization|link rows for
    // this page (not day-filtered) — link marks from prior sessions
    // still represent unresolved mistakes. Cleared rows contribute 0.
    const allActiveMarks = await db
      .select({ mistakeType: ayahMistakesTable.mistakeType })
      .from(ayahMistakesTable)
      .where(
        and(
          eq(ayahMistakesTable.userId, userId),
          eq(ayahMistakesTable.pageNumber, pageNumber),
          sql`${ayahMistakesTable.resolvedAt} is null`,
          inArray(ayahMistakesTable.mistakeType, ["memorization", "link"]),
        ),
      );
    const totalMistakes = allActiveMarks.length;
    const quality = bucketQuality(totalMistakes, settings.goodMax, settings.hardMax);

    // Avoid recording a duplicate when the user is just shuffling marks
    // around without changing the page's overall verdict. Look at the
    // most recent recitation_log row TODAY for this page (bounded to
    // exclude future-dated rows).
    const [latestToday] = await db
      .select({ quality: recitationLogTable.quality })
      .from(recitationLogTable)
      .where(
        and(
          eq(recitationLogTable.userId, userId),
          eq(recitationLogTable.pageNumber, pageNumber),
          gte(recitationLogTable.recitedAt, dayStart),
          lt(recitationLogTable.recitedAt, dayEnd),
        ),
      )
      .orderBy(desc(recitationLogTable.recitedAt))
      .limit(1);
    if (latestToday && latestToday.quality === quality) return;

    await ensurePageExists(userId, pageNumber);

    const recitedAt = new Date();
    const dueDate = calculateDueDate(recitedAt, quality, settings);

    await db.transaction(async (tx) => {
      // Hold a per-user lock so two mutations landing in the same
      // millisecond can't both pass the "no duplicate" check above and
      // each insert a row.
      await tx.execute(
        sql`select pg_advisory_xact_lock(${AUTO_ASSIGN_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
      );

      // Re-check inside the lock — somebody else may have just inserted
      // the same auto-assignment.
      const [latestUnderLock] = await tx
        .select({ quality: recitationLogTable.quality })
        .from(recitationLogTable)
        .where(
          and(
            eq(recitationLogTable.userId, userId),
            eq(recitationLogTable.pageNumber, pageNumber),
            gte(recitationLogTable.recitedAt, dayStart),
            lt(recitationLogTable.recitedAt, dayEnd),
          ),
        )
        .orderBy(desc(recitationLogTable.recitedAt))
        .limit(1);
      if (latestUnderLock && latestUnderLock.quality === quality) return;

      await tx
        .update(pageProgressTable)
        .set({
          quality,
          mistakes: totalMistakes,
          lastRecited: recitedAt,
          dueDate,
          inScope: true,
        })
        .where(
          and(
            eq(pageProgressTable.userId, userId),
            eq(pageProgressTable.pageNumber, pageNumber),
          ),
        );

      await tx.insert(recitationLogTable).values({
        userId,
        pageNumber,
        quality,
        mistakes: totalMistakes,
        recitedAt,
        dueDate,
      });
    });
  } catch (err) {
    // Never let auto-assign errors propagate — the user's mark already
    // committed and the only loss is the convenience auto-record.
    logger.warn({ err, userId, pageNumber }, "auto-assign-page failed");
  }
}
