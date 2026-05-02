import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody, GetSettingsResponse, UpdateSettingsResponse } from "@workspace/api-zod";
import { getSettings } from "../lib/progress-helpers";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/settings", requireAuth, async (req, res): Promise<void> => {
  const settings = await getSettings(req.userId!);
  res.json(GetSettingsResponse.parse(settings));
});

router.patch("/settings", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const current = await getSettings(req.userId!);
  const [updated] = await db
    .update(settingsTable)
    .set(parsed.data)
    .where(eq(settingsTable.id, current.id))
    .returning();

  res.json(UpdateSettingsResponse.parse(updated));
});

export default router;
