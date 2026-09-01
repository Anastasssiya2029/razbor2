import { Router, type IRouter } from "express";
import { DrawAnalysisGiftBody, DrawAnalysisGiftParams, GetAnalysisGiftParams } from "@workspace/api-zod";
import { requireAnalysisRunAccess, AnalysisRunAccessError } from "../reference/server/analysis-runs/access";
import { drawAnalysisGift, getAnalysisGifts } from "../reference/server/gifts/service";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/analysis-runs/:analysisRunId/gift", requireAuth, async (req, res) => {
  const params = GetAnalysisGiftParams.parse(req.params);
  try {
    await requireAnalysisRunAccess(req.authUser!, params.analysisRunId);
    const gifts = await getAnalysisGifts(params.analysisRunId);
    res.status(200).json({ gifts });
  } catch (error) {
    if (error instanceof AnalysisRunAccessError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    throw error;
  }
});

router.post("/analysis-runs/:analysisRunId/gift", requireAuth, async (req, res) => {
  const params = DrawAnalysisGiftParams.parse(req.params);
  const body = DrawAnalysisGiftBody.parse(req.body);
  try {
    await requireAnalysisRunAccess(req.authUser!, params.analysisRunId, { ownerOnly: true });
    const draw = await drawAnalysisGift({
      analysisRunId: params.analysisRunId,
      tariff: body.tariff,
      actorUserId: req.authUser!.id,
    });
    res.status(200).json(draw);
  } catch (error) {
    if (error instanceof AnalysisRunAccessError) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    throw error;
  }
});

export default router;
