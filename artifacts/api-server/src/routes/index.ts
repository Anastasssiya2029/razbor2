import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import clientsRouter from "./clients";
import diagnosticsRouter from "./diagnostics";
import analysisRouter from "./analysis";
import managerPlanRouter from "./manager-plan";
import exportRouter from "./export";
import giftRouter from "./gift";
import { attachAuthUser } from "../middlewares/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(attachAuthUser, clientsRouter);
// exportRouter must be registered before diagnosticsRouter/analysisRouter:
// its literal paths like /diagnostics/registry.xlsx would otherwise be
// shadowed by their generic /diagnostics/:diagnosticId param routes.
router.use(attachAuthUser, exportRouter);
router.use(attachAuthUser, giftRouter);
router.use(attachAuthUser, diagnosticsRouter);
router.use(attachAuthUser, analysisRouter);
router.use(attachAuthUser, managerPlanRouter);

export default router;
