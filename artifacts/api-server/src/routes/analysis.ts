import { Router, type IRouter } from "express";
import {
  AdvanceAnalysisRunParams,
  GetAnalysisResultParams,
  GetAnalysisRunCostDetailParams,
  GetAnalysisRunParams,
  ListAnalysisRunsParams,
} from "@workspace/api-zod";
import { getDiagnosticById } from "../domain/diagnostic/repository";
import { getAverageCompletedRunDuration, getCostDetailForRun, getUnlinkedSituationSummaryCost } from "../domain/analysis-pipeline/cost";
import { canAccessOwnedAnalysis } from "../domain/auth/policy";
import {
  advanceAnalysisRun,
  getAnalysisResultByRun,
  getAnalysisRun,
  getOverviewForRun,
  listAnalysisRunsForDiagnostic,
  retryFailedStep,
  PipelineServiceError,
  type AnalysisOverview,
} from "../domain/analysis-pipeline/service";
import type { AnalysisRun } from "@workspace/db";

// Early (pre-"strategizing") statuses can't have a stored target/archetype
// snapshot yet, so skip the extra lookup for them. "analysis_failed" IS
// included even though it's not in the normal forward sequence: a failure
// during P-02 (strategizing) or P-04 (report writing) happens *after* the
// target/archetype snapshot was already persisted, so those failed runs
// still have a valid overview to progressively reveal -- only a P-01
// (evidence-quality gate) failure, which happens before targeting, has
// nothing to show. getAnalysisOverview's own guard returns null in that
// case, so it's safe to always attempt the lookup for failed runs.
const OVERVIEW_ELIGIBLE_STATUSES = new Set([
  "strategizing",
  "resolving_tasks",
  "money_now",
  "money_now_prescribing",
  "writing_report",
  "ready",
  "analysis_failed",
]);

async function withOverview(run: AnalysisRun | null): Promise<(AnalysisRun & { overview: AnalysisOverview | null }) | null> {
  if (!run) return null;
  const overview = OVERVIEW_ELIGIBLE_STATUSES.has(run.status) ? await getOverviewForRun(run.id) : null;
  return { ...run, overview };
}
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/diagnostics/:diagnosticId/analysis-runs/list", requireAuth, async (req, res) => {
  const params = ListAnalysisRunsParams.parse(req.params);
  const diagnostic = await getDiagnosticById(params.diagnosticId);
  if (!diagnostic) {
    res.status(404).json({ error: "Диагностика не найдена." });
    return;
  }
  if (!canAccessOwnedAnalysis(req.authUser!.role, req.authUser!.id, diagnostic.ownerUserId)) {
    res.status(403).json({ error: "Недостаточно прав." });
    return;
  }
  const runs = await listAnalysisRunsForDiagnostic(params.diagnosticId);
  res.status(200).json(runs);
});

// Typical full-run duration, estimated from recently completed runs' real
// ai_call_log spans. Any authenticated user may read this (it carries no
// per-run or per-client information) -- it's used to calibrate the waiting
// screen's progress estimate, not for architect-only cost reporting.
router.get("/analysis-runs/average-duration", requireAuth, async (_req, res) => {
  const average = await getAverageCompletedRunDuration();
  res.status(200).json(average);
});

router.get("/analysis-runs/:analysisRunId", requireAuth, async (req, res) => {
  const params = GetAnalysisRunParams.parse(req.params);
  const run = await getAnalysisRun(params.analysisRunId);
  if (!run) {
    res.status(404).json({ error: "Анализ не найден." });
    return;
  }
  if (!canAccessOwnedAnalysis(req.authUser!.role, req.authUser!.id, run.ownerUserId)) {
    res.status(403).json({ error: "Недостаточно прав." });
    return;
  }
  res.status(200).json(await withOverview(run));
});

// Advances the pipeline by exactly one resumable step per request, matching
// the reference's polling-driven /run endpoint: the frontend calls this
// repeatedly until status is "ready" or "analysis_failed".
router.post("/analysis-runs/:analysisRunId/run", requireAuth, async (req, res) => {
  const params = AdvanceAnalysisRunParams.parse(req.params);
  const run = await getAnalysisRun(params.analysisRunId);
  if (!run) {
    res.status(404).json({ error: "Анализ не найден." });
    return;
  }
  if (!canAccessOwnedAnalysis(req.authUser!.role, req.authUser!.id, run.ownerUserId)) {
    res.status(403).json({ error: "Недостаточно прав." });
    return;
  }
  try {
    await advanceAnalysisRun(params.analysisRunId);
    const updated = await getAnalysisRun(params.analysisRunId);
    res.status(200).json(await withOverview(updated));
  } catch (error) {
    if (error instanceof PipelineServiceError) {
      if (error.retryAfterSeconds) res.setHeader("retry-after", String(error.retryAfterSeconds));
      res.status(error.status).json({ error: error.message, retryAfterSeconds: error.retryAfterSeconds });
      return;
    }
    throw error;
  }
});

// Retries a recoverable failed run (P-02 strategy or P-04 report-writing
// stage) from where it left off, without recreating the diagnostic. Fails
// with 409 when the run's errorCode is not one of the recoverable stages
// (e.g. P-01 evidence-quality gate failures require a new submission).
router.post("/analysis-runs/:analysisRunId/retry", requireAuth, async (req, res) => {
  const params = AdvanceAnalysisRunParams.parse(req.params);
  const run = await getAnalysisRun(params.analysisRunId);
  if (!run) {
    res.status(404).json({ error: "Анализ не найден." });
    return;
  }
  if (!canAccessOwnedAnalysis(req.authUser!.role, req.authUser!.id, run.ownerUserId)) {
    res.status(403).json({ error: "Недостаточно прав." });
    return;
  }
  try {
    await retryFailedStep(params.analysisRunId);
    const updated = await getAnalysisRun(params.analysisRunId);
    res.status(200).json(await withOverview(updated));
  } catch (error) {
    if (error instanceof PipelineServiceError) {
      if (error.retryAfterSeconds) res.setHeader("retry-after", String(error.retryAfterSeconds));
      res.status(error.status).json({ error: error.message, retryAfterSeconds: error.retryAfterSeconds });
      return;
    }
    throw error;
  }
});

// Architect-only: real per-attempt cost/time breakdown (P01-P04, including
// retries/failures). requireRole enforces this for direct API calls too, not
// just the dashboard UI -- manager/admin get a 403 even with a valid session.
router.get("/analysis-runs/:analysisRunId/cost-detail", requireAuth, requireRole("architect"), async (req, res) => {
  const params = GetAnalysisRunCostDetailParams.parse(req.params);
  const run = await getAnalysisRun(params.analysisRunId);
  if (!run) {
    res.status(404).json({ error: "Анализ не найден." });
    return;
  }
  res.status(200).json(await getCostDetailForRun(run));
});

// Architect-only: real OpenRouter spend on situation-summary calls that
// never got attached to a submitted diagnostic. Registered before the
// "/analysis-runs/:analysisRunId" family below only for readability -- this
// path lives under a separate "/ai-usage" prefix so it can never collide
// with an analysisRunId route param.
router.get("/ai-usage/unlinked-cost", requireAuth, requireRole("architect"), async (_req, res) => {
  const summary = await getUnlinkedSituationSummaryCost();
  res.status(200).json({
    callCount: summary.callCount,
    hasData: summary.hasData,
    totalCostUsd: summary.hasData ? summary.costUsd : null,
    totalCostRub: summary.hasData ? summary.costRub : null,
  });
});

router.get("/analysis-runs/:analysisRunId/result", requireAuth, async (req, res) => {
  const params = GetAnalysisResultParams.parse(req.params);
  const run = await getAnalysisRun(params.analysisRunId);
  if (!run) {
    res.status(404).json({ error: "Анализ не найден." });
    return;
  }
  if (!canAccessOwnedAnalysis(req.authUser!.role, req.authUser!.id, run.ownerUserId)) {
    res.status(403).json({ error: "Недостаточно прав." });
    return;
  }
  const result = await getAnalysisResultByRun(params.analysisRunId);
  if (!result) {
    res.status(404).json({ error: "Результат ещё не готов." });
    return;
  }
  res.status(200).json(result);
});

export default router;
