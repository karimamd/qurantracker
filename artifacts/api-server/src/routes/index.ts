/**
 * Aggregate /api router — composes the per-feature routers in registration
 * order. Mounted by app.ts under "/api". Order matters only when multiple
 * routers register overlapping paths; today they don't.
 */
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import settingsRouter from "./settings";
import progressRouter from "./progress";
import homeworkRouter from "./homework";
import telawaRouter from "./telawa";
import backupRouter from "./backup";

const router: IRouter = Router();

router.use(healthRouter);
router.use(settingsRouter);
router.use(progressRouter);
router.use(homeworkRouter);
router.use(telawaRouter);
router.use(backupRouter);

export default router;
