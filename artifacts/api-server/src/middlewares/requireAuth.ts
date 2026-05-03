import type { Request, Response, NextFunction, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { getAuth, clerkClient } from "@clerk/express";
import { db, pageProgressTable, recitationLogTable, homeworkSessionsTable, homeworkItemsTable, settingsTable, ayahMistakesTable, telawaLogTable } from "@workspace/db";
import { and, eq, exists, isNull, notExists, sql } from "drizzle-orm";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      isGuest?: boolean;
    }
  }
}

// ---------------------------------------------------------------------------
// Guest mode
// ---------------------------------------------------------------------------
// A visitor who hasn't signed up gets a random `guest_id` cookie on first
// API request. That id becomes their `userId` for every row they create. If
// they later sign up via Clerk, the FIRST signed-in request migrates all
// their guest rows to the new Clerk user id and clears the guest cookie —
// so the "try, then sign up" flow keeps their data.
const GUEST_COOKIE = "guest_id";
const GUEST_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
const GUEST_ID_PREFIX = "guest_";

function setGuestCookie(res: Response, value: string) {
  res.cookie(GUEST_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_COOKIE_MAX_AGE_MS,
  });
}

function clearGuestCookie(res: Response) {
  res.clearCookie(GUEST_COOKIE, { path: "/" });
}

function isValidGuestId(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(GUEST_ID_PREFIX) && value.length > GUEST_ID_PREFIX.length;
}

// Conflict-resolution policy for the rare "user signs out → uses as guest →
// signs back in" path: the user's existing (Clerk-owned) data wins. We drop
// the overlapping guest rows BEFORE updating, so unique-constraint violations
// can't fail the migration. The vast majority of sign-ups are first-time and
// will have no conflicts at all.
//
// Tables with user-scoped uniqueness (must be conflict-resolved):
//   - settings:      unique(user_id)
//   - page_progress: unique(user_id, page_number)
//
// Tables with only non-unique indexes on user_id (can be UPDATE'd directly):
//   - recitation_log, homework_sessions, homework_items
//
// Wrapped in a single transaction so it's all-or-nothing.
async function migrateGuestData(guestUserId: string, newUserId: string, log: Request["log"]): Promise<void> {
  try {
    const counts = await db.transaction(async (tx) => {
      // settings: drop guest's settings row if the new user already has one,
      // otherwise update it to the new user_id.
      const droppedSettings = await tx
        .delete(settingsTable)
        .where(
          and(
            eq(settingsTable.userId, guestUserId),
            exists(
              tx
                .select({ one: sql`1` })
                .from(sql`${settingsTable} AS existing`)
                .where(sql`existing.user_id = ${newUserId}`),
            ),
          ),
        );
      const updatedSettings = await tx
        .update(settingsTable)
        .set({ userId: newUserId })
        .where(eq(settingsTable.userId, guestUserId));

      // page_progress: drop guest rows whose page_number already exists for
      // the new user, then update the rest.
      const droppedPages = await tx
        .delete(pageProgressTable)
        .where(
          and(
            eq(pageProgressTable.userId, guestUserId),
            exists(
              tx
                .select({ one: sql`1` })
                .from(sql`${pageProgressTable} AS existing`)
                .where(
                  sql`existing.user_id = ${newUserId} AND existing.page_number = ${pageProgressTable.pageNumber}`,
                ),
            ),
          ),
        );
      const updatedPages = await tx
        .update(pageProgressTable)
        .set({ userId: newUserId })
        .where(eq(pageProgressTable.userId, guestUserId));

      // No user-scoped uniqueness — straight updates.
      const recitations = await tx
        .update(recitationLogTable)
        .set({ userId: newUserId })
        .where(eq(recitationLogTable.userId, guestUserId));
      const sessions = await tx
        .update(homeworkSessionsTable)
        .set({ userId: newUserId })
        .where(eq(homeworkSessionsTable.userId, guestUserId));
      const items = await tx
        .update(homeworkItemsTable)
        .set({ userId: newUserId })
        .where(eq(homeworkItemsTable.userId, guestUserId));
      const ayahMistakes = await tx
        .update(ayahMistakesTable)
        .set({ userId: newUserId })
        .where(eq(ayahMistakesTable.userId, guestUserId));
      const telawa = await tx
        .update(telawaLogTable)
        .set({ userId: newUserId })
        .where(eq(telawaLogTable.userId, guestUserId));

      return {
        settingsDropped: droppedSettings.rowCount ?? 0,
        settingsMoved: updatedSettings.rowCount ?? 0,
        pagesDropped: droppedPages.rowCount ?? 0,
        pagesMoved: updatedPages.rowCount ?? 0,
        recitationsMoved: recitations.rowCount ?? 0,
        sessionsMoved: sessions.rowCount ?? 0,
        itemsMoved: items.rowCount ?? 0,
        ayahMistakesMoved: ayahMistakes.rowCount ?? 0,
        telawaMoved: telawa.rowCount ?? 0,
      };
    });
    log?.info({ guestUserId, newUserId, ...counts }, "Migrated guest data to signed-in user");
  } catch (err) {
    log?.error({ err, guestUserId, newUserId }, "Failed to migrate guest data");
    throw err;
  }
}

// `notExists` is unused but imported for readability of the policy above.
void notExists;

// ---------------------------------------------------------------------------
// Owner-gated orphan claim (legacy single-user data)
// ---------------------------------------------------------------------------
// Owner-gated orphan claim. When auth is bolted onto a pre-existing
// single-user database, all rows with NULL user_id should be assigned to the
// owner of the legacy data — and ONLY to that owner. We identify the owner by
// the OWNER_EMAIL env var (the email of the human who owned the pre-auth
// data). On the first signed-in request whose Clerk user has that email, the
// orphan rows are reassigned to that user. Other users never claim orphans
// even if they sign in first.
const OWNER_EMAIL = (process.env.OWNER_EMAIL ?? "").toLowerCase();
let orphansClaimed = false;
const checkedNonOwnerUserIds = new Set<string>();

async function maybeClaimOrphansForUser(userId: string, log: Request["log"]): Promise<void> {
  if (orphansClaimed) return;
  if (!OWNER_EMAIL) return;
  if (checkedNonOwnerUserIds.has(userId)) return;

  let email: string | undefined;
  try {
    const user = await clerkClient.users.getUser(userId);
    email = user.emailAddresses
      .find((e) => e.id === user.primaryEmailAddressId)
      ?.emailAddress?.toLowerCase();
  } catch (err) {
    log?.error({ err, userId }, "Failed to fetch Clerk user for orphan-claim check");
    return;
  }

  if (email !== OWNER_EMAIL) {
    checkedNonOwnerUserIds.add(userId);
    log?.info({ userId, email }, "Orphan-claim skipped: signed-in user is not the data owner");
    return;
  }

  orphansClaimed = true;
  try {
    const results = await Promise.all([
      db.update(pageProgressTable).set({ userId }).where(isNull(pageProgressTable.userId)),
      db.update(recitationLogTable).set({ userId }).where(isNull(recitationLogTable.userId)),
      db.update(homeworkSessionsTable).set({ userId }).where(isNull(homeworkSessionsTable.userId)),
      db.update(homeworkItemsTable).set({ userId }).where(isNull(homeworkItemsTable.userId)),
      db.update(settingsTable).set({ userId }).where(isNull(settingsTable.userId)),
      db.update(ayahMistakesTable).set({ userId }).where(isNull(ayahMistakesTable.userId)),
      db.update(telawaLogTable).set({ userId }).where(isNull(telawaLogTable.userId)),
    ]);
    log?.info(
      {
        userId,
        email,
        rowCounts: {
          pageProgress: results[0].rowCount ?? null,
          recitationLog: results[1].rowCount ?? null,
          homeworkSessions: results[2].rowCount ?? null,
          homeworkItems: results[3].rowCount ?? null,
          settings: results[4].rowCount ?? null,
          ayahMistakes: results[5].rowCount ?? null,
          telawa: results[6].rowCount ?? null,
        },
      },
      "Orphan rows claimed for owner",
    );
  } catch (err) {
    orphansClaimed = false;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  // Idempotent: when multiple sub-routers mount requireAuth, only run once
  // per request so we don't issue duplicate guest cookies or re-migrate.
  if (req.userId) {
    next();
    return;
  }
  const auth = getAuth(req);
  const clerkUserId = (auth?.sessionClaims?.userId as string | undefined) ?? auth?.userId ?? null;
  const cookieGuestId = req.cookies?.[GUEST_COOKIE];
  const guestId = isValidGuestId(cookieGuestId) ? cookieGuestId : null;

  if (clerkUserId) {
    // Signed-in: if there's also a guest cookie, migrate the guest's data
    // into the Clerk account, then clear the cookie so it doesn't keep
    // re-triggering migration.
    if (guestId && guestId !== clerkUserId) {
      try {
        await migrateGuestData(guestId, clerkUserId, req.log);
        clearGuestCookie(res);
      } catch (err) {
        // Don't block the request — the data will still be there under the
        // guest id, and we can retry on the next request.
        req.log?.error({ err }, "Guest data migration failed; will retry on next request");
      }
    }
    req.userId = clerkUserId;
    req.isGuest = false;
    try {
      await maybeClaimOrphansForUser(clerkUserId, req.log);
    } catch (err) {
      req.log?.error({ err }, "Failed to claim orphan rows");
    }
    next();
    return;
  }

  // Not signed in. Use the existing guest cookie or mint a new one.
  let userId = guestId;
  if (!userId) {
    userId = `${GUEST_ID_PREFIX}${randomUUID().replace(/-/g, "")}`;
    setGuestCookie(res, userId);
  }
  req.userId = userId;
  req.isGuest = true;
  next();
};
