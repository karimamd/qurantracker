import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAuth } from "@clerk/express";
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

// One-shot, in-memory flag. Intentional: when auth is bolted onto pre-existing
// single-user dev data (rows with NULL user_id), the first signed-in user
// after server boot claims those rows. All subsequent users start with a
// clean slate. This is deliberately not persisted — once the dev data is
// claimed, the flag stays true for the life of the process and is reset on
// restart (where the now-non-NULL rows simply won't match the WHERE clause).
let orphansClaimed = false;

async function claimOrphansForUser(userId: string): Promise<void> {
  if (orphansClaimed) return;
  orphansClaimed = true;
  try {
    await Promise.all([
      db.update(pageProgressTable).set({ userId }).where(isNull(pageProgressTable.userId)),
      db.update(recitationLogTable).set({ userId }).where(isNull(recitationLogTable.userId)),
      db.update(homeworkSessionsTable).set({ userId }).where(isNull(homeworkSessionsTable.userId)),
      db.update(homeworkItemsTable).set({ userId }).where(isNull(homeworkItemsTable.userId)),
      db.update(settingsTable).set({ userId }).where(isNull(settingsTable.userId)),
    ]);
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
    await claimOrphansForUser(userId);
  } catch (err) {
    req.log?.error({ err }, "Failed to claim orphan rows");
  }
  next();
};
