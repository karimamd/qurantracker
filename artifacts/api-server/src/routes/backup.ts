/**
 * /api/backup — lightweight self-serve import / export of every user-owned
 * row across all 8 tables. Acts as a zero-config alternative to the deferred
 * Google Drive integration: the user clicks Export → gets a JSON file → can
 * later Import to restore on this device, another device, or a brand-new
 * account (signed-in or guest).
 *
 * Wire shape (BackupSchema below) keeps a stable `version: 1` envelope so
 * future schema migrations can branch on it without breaking older exports.
 *
 * Import semantics:
 *   - Atomically REPLACES every user-scoped row with the file contents
 *     inside a single transaction. There is no merge — partial files would
 *     silently delete data the user expected to keep, which is worse than a
 *     loud overwrite. The client confirms before posting.
 *   - Server-managed ids (page_progress.id, recitation_log.id, ...) are
 *     re-issued by the DB on insert. Cross-table references that still need
 *     to survive the round-trip — homework_items.homeworkId →
 *     homework_sessions.id, telawa_log.khatmahId → telawa_khatmah.id — are
 *     remapped from the export's old ids to the new ids issued at import.
 *   - Date fields arrive as ISO strings via JSON; `z.coerce.date()` rebuilds
 *     them into JS Dates so Drizzle's `withTimezone: true` columns stay
 *     unambiguous.
 *
 * Export skips empty arrays from the response shape entirely so a brand-new
 * user's backup is still small and readable.
 */
import express, { Router, type IRouter } from "express";
import { z } from "zod/v4";
import {
  db,
  settingsTable,
  pageProgressTable,
  recitationLogTable,
  ayahMistakesTable,
  homeworkSessionsTable,
  homeworkItemsTable,
  telawaKhatmahTable,
  telawaLogTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getSettings } from "../lib/progress-helpers";

const router: IRouter = Router();

const BACKUP_VERSION = 1 as const;

/**
 * Per-user advisory lock for the import transaction. Same pattern used by
 * routes/telawa.ts — namespace + hashtext(userId) gives a deterministic
 * (int, int) key that serializes import against any concurrent recite /
 * homework / telawa write for the same user. "bkup" in hex.
 */
const BACKUP_LOCK_NAMESPACE = 0x62_6b_75_70;

/** Constrained domain enums shared across the backup payload. */
const QualityEnum = z.enum(["excellent", "good", "hard", "relearn"]);
const LanguageEnum = z.enum(["en", "ar"]);
const MistakeTypeEnum = z.enum(["memorization", "link"]);
const HomeworkItemTypeEnum = z.enum(["memorize", "revise"]);

/** A timestamp that may arrive as an ISO string (fresh export) or as null. */
const tsNullable = z.preprocess(
  (v) => (v === null || v === undefined || v === "" ? null : v),
  z.coerce.date().nullable(),
);
const ts = z.coerce.date();

/** Mushaf page bound shared across all per-page schemas (1..604). */
const pageNumber = z.number().int().min(1).max(604);

const SettingsImport = z.object({
  excellentDays: z.number().int().min(1).max(3650),
  goodDays: z.number().int().min(1).max(3650),
  hardDays: z.number().int().min(1).max(3650),
  relearnDays: z.number().int().min(1).max(3650),
  language: LanguageEnum,
  telawaPagesPerDay: z.number().int().min(1).max(604),
  readerFontSize: z.number().int().min(14).max(64),
  ayahViewFontSize: z.number().int().min(14).max(96),
  // Optional for backward-compat: backups taken before the bottom-nav
  // customization feature shipped won't carry this field.
  bottomNavKeys: z
    .array(
      z.enum([
        "homework", "dashboard", "telawa", "reader", "mistakes",
        "juz", "rub", "surah", "pages", "ayahs",
        "recite", "welcome", "settings",
      ]),
    )
    .max(5)
    .optional(),
  // All three optional for backward compatibility with backups taken
  // before the auto-assign-from-ayahs feature shipped — older files
  // simply restore as the schema defaults (false / 2 / 6).
  autoAssignPageFromAyahs: z.boolean().optional(),
  mistakesGoodMax: z.number().int().min(0).max(100).optional(),
  mistakesHardMax: z.number().int().min(0).max(100).optional(),
});

const PageProgressImport = z.object({
  pageNumber,
  customName: z.string().nullable().optional(),
  inScope: z.boolean(),
  quality: QualityEnum.nullable().optional(),
  mistakes: z.number().int().min(0).nullable().optional(),
  lastRecited: tsNullable.optional(),
  dueDate: tsNullable.optional(),
});

const RecitationLogImport = z.object({
  pageNumber,
  quality: QualityEnum,
  mistakes: z.number().int().min(0).nullable().optional(),
  recitedAt: ts,
  dueDate: tsNullable.optional(),
});

const AyahMistakeImport = z.object({
  pageNumber,
  surahNumber: z.number().int().min(1).max(114),
  ayahNumberInSurah: z.number().int().min(1).max(286),
  globalAyahNumber: z.number().int().min(1).max(6236),
  mistakeType: MistakeTypeEnum,
  recitedAt: ts,
  resolvedAt: tsNullable.optional(),
});

const HomeworkSessionImport = z.object({
  /** Old id from the source database — kept only to remap items. */
  id: z.number().int(),
  title: z.string().min(1).max(500),
  dueDate: ts,
});

const HomeworkItemImport = z.object({
  /** References HomeworkSessionImport.id within the same payload. */
  homeworkId: z.number().int(),
  pageNumber,
  type: HomeworkItemTypeEnum,
  completed: z.boolean(),
  quality: QualityEnum.nullable().optional(),
  completedAt: tsNullable.optional(),
});

const TelawaKhatmahImport = z.object({
  /** Old id — referenced by TelawaLogImport.khatmahId for remap. */
  id: z.number().int(),
  startPage: pageNumber,
  cycleNumber: z.number().int().min(1),
  pagesPerDay: z.number().int().min(1).max(604).nullable().optional(),
  startedAt: ts,
  completedAt: tsNullable.optional(),
});

const TelawaLogImport = z.object({
  pageNumber,
  cycleNumber: z.number().int().min(1),
  /** Refers to TelawaKhatmahImport.id, or null for legacy rows. */
  khatmahId: z.number().int().nullable().optional(),
  readAt: ts,
});

const BackupSchema = z.object({
  version: z.literal(BACKUP_VERSION),
  exportedAt: ts.optional(),
  settings: SettingsImport.optional(),
  pageProgress: z.array(PageProgressImport).default([]),
  recitationLog: z.array(RecitationLogImport).default([]),
  ayahMistakes: z.array(AyahMistakeImport).default([]),
  homeworkSessions: z.array(HomeworkSessionImport).default([]),
  homeworkItems: z.array(HomeworkItemImport).default([]),
  telawaKhatmah: z.array(TelawaKhatmahImport).default([]),
  telawaLog: z.array(TelawaLogImport).default([]),
});

router.get("/backup/export", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;

  const [settings, pageProgress, recitationLog, ayahMistakes, homeworkSessions, homeworkItems, telawaKhatmah, telawaLog] =
    await Promise.all([
      getSettings(userId),
      db.select().from(pageProgressTable).where(eq(pageProgressTable.userId, userId)),
      db.select().from(recitationLogTable).where(eq(recitationLogTable.userId, userId)),
      db.select().from(ayahMistakesTable).where(eq(ayahMistakesTable.userId, userId)),
      db.select().from(homeworkSessionsTable).where(eq(homeworkSessionsTable.userId, userId)),
      db.select().from(homeworkItemsTable).where(eq(homeworkItemsTable.userId, userId)),
      db.select().from(telawaKhatmahTable).where(eq(telawaKhatmahTable.userId, userId)),
      db.select().from(telawaLogTable).where(eq(telawaLogTable.userId, userId)),
    ]);

  const payload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      excellentDays: settings.excellentDays,
      goodDays: settings.goodDays,
      hardDays: settings.hardDays,
      relearnDays: settings.relearnDays,
      language: settings.language,
      telawaPagesPerDay: settings.telawaPagesPerDay,
      readerFontSize: settings.readerFontSize,
      ayahViewFontSize: settings.ayahViewFontSize,
      bottomNavKeys: settings.bottomNavKeys,
      autoAssignPageFromAyahs: settings.autoAssignPageFromAyahs,
      mistakesGoodMax: settings.mistakesGoodMax,
      mistakesHardMax: settings.mistakesHardMax,
    },
    pageProgress: pageProgress.map((r) => ({
      pageNumber: r.pageNumber,
      customName: r.customName,
      inScope: r.inScope,
      quality: r.quality,
      mistakes: r.mistakes,
      lastRecited: r.lastRecited,
      dueDate: r.dueDate,
    })),
    recitationLog: recitationLog.map((r) => ({
      pageNumber: r.pageNumber,
      quality: r.quality,
      mistakes: r.mistakes,
      recitedAt: r.recitedAt,
      dueDate: r.dueDate,
    })),
    ayahMistakes: ayahMistakes.map((r) => ({
      pageNumber: r.pageNumber,
      surahNumber: r.surahNumber,
      ayahNumberInSurah: r.ayahNumberInSurah,
      globalAyahNumber: r.globalAyahNumber,
      mistakeType: r.mistakeType,
      recitedAt: r.recitedAt,
      resolvedAt: r.resolvedAt,
    })),
    // Keep the original id so items can reference their parent session inside
    // the same export. Server reissues new ids on import; we remap.
    homeworkSessions: homeworkSessions.map((r) => ({
      id: r.id,
      title: r.title,
      dueDate: r.dueDate,
    })),
    homeworkItems: homeworkItems.map((r) => ({
      homeworkId: r.homeworkId,
      pageNumber: r.pageNumber,
      type: r.type,
      completed: r.completed,
      quality: r.quality,
      completedAt: r.completedAt,
    })),
    telawaKhatmah: telawaKhatmah.map((r) => ({
      id: r.id,
      startPage: r.startPage,
      cycleNumber: r.cycleNumber,
      pagesPerDay: r.pagesPerDay,
      startedAt: r.startedAt,
      completedAt: r.completedAt,
    })),
    telawaLog: telawaLog.map((r) => ({
      pageNumber: r.pageNumber,
      cycleNumber: r.cycleNumber,
      khatmahId: r.khatmahId,
      readAt: r.readAt,
    })),
  };

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="quran-tracker-backup-${stamp}.json"`,
  );
  res.status(200).send(JSON.stringify(payload, null, 2));
});

// Route-level body parser with a generous cap. The default 100kb on
// app.use(express.json()) trips well before a real user's recitation_log /
// telawa_log finishes serializing — bumping to 50 MB comfortably covers
// years of daily activity (each row is on the order of ~120 bytes JSON).
const importBodyParser = express.json({ limit: "50mb" });

router.post("/backup/import", requireAuth, importBodyParser, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = BackupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid backup file", details: parsed.error.message });
    return;
  }
  const data = parsed.data;

  try {
    const counts = await db.transaction(async (tx) => {
      // Per-user advisory lock — serializes the import against any
      // concurrent recite / homework / telawa write so the post-import state
      // is exactly what the file describes (no interleaved partial writes).
      await tx.execute(
        sql`select pg_advisory_xact_lock(${BACKUP_LOCK_NAMESPACE}::int, hashtext(${userId})::int)`,
      );

      // Wipe every user-scoped row first so the import is a clean replace
      // rather than a merge. Order doesn't matter since there are no FK
      // constraints, but we list them all for explicitness.
      await tx.delete(telawaLogTable).where(eq(telawaLogTable.userId, userId));
      await tx.delete(telawaKhatmahTable).where(eq(telawaKhatmahTable.userId, userId));
      await tx.delete(homeworkItemsTable).where(eq(homeworkItemsTable.userId, userId));
      await tx.delete(homeworkSessionsTable).where(eq(homeworkSessionsTable.userId, userId));
      await tx.delete(ayahMistakesTable).where(eq(ayahMistakesTable.userId, userId));
      await tx.delete(recitationLogTable).where(eq(recitationLogTable.userId, userId));
      await tx.delete(pageProgressTable).where(eq(pageProgressTable.userId, userId));
      await tx.delete(settingsTable).where(eq(settingsTable.userId, userId));

      // Settings — single row per user. Insert fresh values, falling back to
      // defaults for any missing partial.
      if (data.settings) {
        await tx.insert(settingsTable).values({ userId, ...data.settings });
      }

      if (data.pageProgress.length) {
        await tx.insert(pageProgressTable).values(
          data.pageProgress.map((r) => ({
            userId,
            pageNumber: r.pageNumber,
            customName: r.customName ?? null,
            inScope: r.inScope,
            quality: r.quality ?? null,
            mistakes: r.mistakes ?? null,
            lastRecited: r.lastRecited ?? null,
            dueDate: r.dueDate ?? null,
          })),
        );
      }

      if (data.recitationLog.length) {
        await tx.insert(recitationLogTable).values(
          data.recitationLog.map((r) => ({
            userId,
            pageNumber: r.pageNumber,
            quality: r.quality,
            mistakes: r.mistakes ?? null,
            recitedAt: r.recitedAt,
            dueDate: r.dueDate ?? null,
          })),
        );
      }

      if (data.ayahMistakes.length) {
        await tx.insert(ayahMistakesTable).values(
          data.ayahMistakes.map((r) => ({
            userId,
            pageNumber: r.pageNumber,
            surahNumber: r.surahNumber,
            ayahNumberInSurah: r.ayahNumberInSurah,
            globalAyahNumber: r.globalAyahNumber,
            mistakeType: r.mistakeType,
            recitedAt: r.recitedAt,
            resolvedAt: r.resolvedAt ?? null,
          })),
        );
      }

      // Re-issue ids for parent rows (sessions, khatmahs) and remap the
      // children's foreign-key columns to the new ids.
      const sessionIdMap = new Map<number, number>();
      for (const s of data.homeworkSessions) {
        const [inserted] = await tx
          .insert(homeworkSessionsTable)
          .values({ userId, title: s.title, dueDate: s.dueDate })
          .returning({ id: homeworkSessionsTable.id });
        sessionIdMap.set(s.id, inserted.id);
      }

      if (data.homeworkItems.length) {
        // Drop items whose parent session vanished from the export so we
        // never write dangling foreign keys.
        const itemValues = data.homeworkItems
          .map((r) => {
            const newId = sessionIdMap.get(r.homeworkId);
            if (newId === undefined) return null;
            return {
              userId,
              homeworkId: newId,
              pageNumber: r.pageNumber,
              type: r.type,
              completed: r.completed,
              quality: r.quality ?? null,
              completedAt: r.completedAt ?? null,
            };
          })
          .filter((v): v is NonNullable<typeof v> => v !== null);
        if (itemValues.length) await tx.insert(homeworkItemsTable).values(itemValues);
      }

      const khatmahIdMap = new Map<number, number>();
      for (const k of data.telawaKhatmah) {
        const [inserted] = await tx
          .insert(telawaKhatmahTable)
          .values({
            userId,
            startPage: k.startPage,
            cycleNumber: k.cycleNumber,
            pagesPerDay: k.pagesPerDay ?? null,
            startedAt: k.startedAt,
            completedAt: k.completedAt ?? null,
          })
          .returning({ id: telawaKhatmahTable.id });
        khatmahIdMap.set(k.id, inserted.id);
      }

      if (data.telawaLog.length) {
        await tx.insert(telawaLogTable).values(
          data.telawaLog.map((r) => ({
            userId,
            pageNumber: r.pageNumber,
            cycleNumber: r.cycleNumber,
            khatmahId:
              r.khatmahId == null ? null : khatmahIdMap.get(r.khatmahId) ?? null,
            readAt: r.readAt,
          })),
        );
      }

      return {
        settings: data.settings ? 1 : 0,
        pageProgress: data.pageProgress.length,
        recitationLog: data.recitationLog.length,
        ayahMistakes: data.ayahMistakes.length,
        homeworkSessions: data.homeworkSessions.length,
        homeworkItems: data.homeworkItems.length,
        telawaKhatmah: data.telawaKhatmah.length,
        telawaLog: data.telawaLog.length,
      };
    });

    req.log?.info({ userId, counts }, "Imported backup");
    res.json({ ok: true, counts });
  } catch (err) {
    req.log?.error({ err, userId }, "Failed to import backup");
    res.status(500).json({ error: "Failed to import backup" });
  }
});

export default router;
