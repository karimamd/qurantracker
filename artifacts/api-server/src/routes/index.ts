import { Router, type IRouter } from "express";
import healthRouter from "./health";
import settingsRouter from "./settings";
import progressRouter from "./progress";
import homeworkRouter from "./homework";
import telawaRouter from "./telawa";

const router: IRouter = Router();

router.use(healthRouter);
router.use(settingsRouter);
router.use(progressRouter);
router.use(homeworkRouter);
router.use(telawaRouter);

export default router;
