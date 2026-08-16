/**
 * /api/settings — read/update the per-user preferences row.
 *
 * Wraps lib/progress-helpers.getSettings() so a settings row is created on
 * first read. PATCH accepts a Zod-validated partial. The row is uniquely
 * keyed by userId (see lib/db/src/schema/settings.ts), which is the safety
 * net if two parallel first-reads race into the select-then-insert in
 * getSettings — one of them will surface a unique-violation.
 *
 * Changes to {excellent,good,hard,relearn}Days take effect for FUTURE
 * recitations only — past due dates are preserved as logged. Language
 * changes are mirrored client-side by App.tsx → LanguageSync.
 */
import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { UpdateSettingsBody, GetSettingsResponse, UpdateSettingsResponse } from "@workspace/api-zod";
import { getSettings } from "../lib/progress-helpers";
import { syncTelawaGoalPoints } from "../lib/rewards";
import { getTelawaTodaySnapshot } from "./telawa";
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

  // Cross-field guard: when both thresholds are supplied together,
  // enforce hardMax >= goodMax server-side so the quality ladder is
  // always well-ordered regardless of what the client sends.
  const { mistakesGoodMax, mistakesHardMax } = parsed.data;
  if (
    mistakesGoodMax !== undefined &&
    mistakesHardMax !== undefined &&
    mistakesHardMax < mistakesGoodMax
  ) {
    res.status(400).json({
      error: "mistakesHardMax must be >= mistakesGoodMax",
    });
    return;
  }

  const current = await getSettings(req.userId!);
  const [updated] = await db
    .update(settingsTable)
    .set(parsed.data)
    .where(eq(settingsTable.id, current.id))
    .returning();

  // Changing the default Telawa daily goal (or the goal-bonus point value)
  // can move today's read count above/below the bonus threshold — resync
  // the once-per-day goal reward. Non-fatal like all reward writes.
  if (parsed.data.telawaPagesPerDay !== undefined || parsed.data.pointsTelawaGoal !== undefined) {
    try {
      const today = await getTelawaTodaySnapshot(req.userId!);
      await syncTelawaGoalPoints(req.userId!, today.readToday, today.pagesPerDay);
    } catch {
      // reward sync is best-effort
    }
  }

  res.json(UpdateSettingsResponse.parse(updated));
});

export default router;
