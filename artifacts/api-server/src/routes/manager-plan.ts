import { Router, type IRouter } from "express";
import { GetManagerPlanParams, SaveManagerPlanBody, SaveManagerPlanParams } from "@workspace/api-zod";
import { requireAnalysisRunAccess, AnalysisRunAccessError } from "../reference/server/analysis-runs/access";
import { getManagerPlanVersion, saveManagerPlanVersion } from "../reference/server/manager-plan/service";
import { ManagerPlanError } from "../reference/server/manager-plan/types";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/analysis-runs/:analysisRunId/manager-plan", requireAuth, async (req, res) => {
  const params = GetManagerPlanParams.parse(req.params);
  try {
    await requireAnalysisRunAccess(req.authUser!, params.analysisRunId);
    const snapshot = await getManagerPlanVersion(params.analysisRunId);
    res.status(200).json(snapshot);
  } catch (error) {
    if (error instanceof AnalysisRunAccessError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    throw error;
  }
});

router.put("/analysis-runs/:analysisRunId/manager-plan", requireAuth, async (req, res) => {
  const params = SaveManagerPlanParams.parse(req.params);
  const body = SaveManagerPlanBody.parse(req.body);
  try {
    await requireAnalysisRunAccess(req.authUser!, params.analysisRunId);
    const plan = await saveManagerPlanVersion({
      analysisRunId: params.analysisRunId,
      actorUserId: req.authUser!.id,
      sourceResultHash: body.sourceResultHash,
      content: body.content,
    });
    res.status(200).json(plan);
  } catch (error) {
    if (error instanceof AnalysisRunAccessError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    if (error instanceof ManagerPlanError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    throw error;
  }
});

export default router;
