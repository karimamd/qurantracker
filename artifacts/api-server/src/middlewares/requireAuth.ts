import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, pageProgressTable, recitationLogTable, homeworkSessionsTable, homeworkItemsTable, settingsTable } from "@workspace/db";
import { isNull } from "drizzle-orm";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// Owner-gated orphan claim. When auth is bolted onto a pre-existing
// single-user database, all rows with NULL user_id should be assigned to the
// owner of the legacy data — and ONLY to that owner. We identify the owner by
// the OWNER_EMAIL env var (the email of the human who owned the pre-auth
// data). On the first signed-in request whose Clerk user has that email, the
// orphan rows are reassigned to that user. Other users never claim orphans
// even if they sign in first.
//
// The flag and cache are in-memory and reset on restart, which is intentional:
// after a successful claim there are no NULL rows left, so a restart is a
// no-op for the claim path.
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
        },
      },
      "Orphan rows claimed for owner",
    );
  } catch (err) {
    orphansClaimed = false;
    throw err;
  }
}

export const requireAuth: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId as string | undefined ?? auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  try {
    await maybeClaimOrphansForUser(userId, req.log);
  } catch (err) {
    req.log?.error({ err }, "Failed to claim orphan rows");
  }
  next();
};
