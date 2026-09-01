import { Router, type IRouter } from "express";
import { CreateDiagnosticBody, GetDiagnosticParams, SubmitDiagnosticDraftBody, SubmitDiagnosticDraftParams, GenerateSituationSummaryBody } from "@workspace/api-zod";
import { DiagnosticContractError } from "../reference/lib/diagnostic-input";
import {
  createDiagnosticRecord,
  DiagnosticAccessError,
  getDiagnosticRecord,
  listDiagnosticsForOwner,
  updateDiagnosticDraft,
} from "../domain/diagnostic/repository";
import {
  generateSituationSummary,
  SituationSummaryConfigurationError,
  SituationSummaryGenerationError,
} from "../domain/diagnostic/situation-summary";
import { canViewAllAnalyses } from "../domain/auth/policy";
import { requireAuth } from "../middlewares/auth";
import { ANALYSIS_RESULT_METHODOLOGY_VERSION } from "../reference/server/analysis-result/types";

const router: IRouter = Router();

function handleDiagnosticError(error: unknown, res: import("express").Response): void {
  if (error instanceof DiagnosticAccessError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return;
  }
  if (error instanceof DiagnosticContractError) {
    res.status(422).json({ error: "invalid_diagnostic_input", issues: error.issues });
    return;
  }
  throw error;
}

router.get("/diagnostics", requireAuth, async (req, res) => {
  const diagnostics = await listDiagnosticsForOwner(
    req.authUser!.id,
    canViewAllAnalyses(req.authUser!.role),
    req.authUser!.role === "architect",
  );
  res.status(200).json(diagnostics);
});

router.post("/diagnostics", requireAuth, async (req, res) => {
  const body = CreateDiagnosticBody.parse(req.body);
  const { intent: rawIntent, sessionId: rawSessionId, ...payload } = body;
  const intent = rawIntent === "draft" ? "draft" : "submit";
  const sessionId = typeof rawSessionId === "string" && rawSessionId ? rawSessionId : undefined;
  try {
    const created = await createDiagnosticRecord({ actor: req.authUser!, payload, intent, sessionId });
    res.status(created.idempotentReplay ? 200 : 201).json({
      clientId: created.clientId ?? null,
      diagnosticId: created.diagnosticId,
      analysisRunId: created.analysisRunId,
      status: intent === "draft" ? "draft" : "queued",
      nextStep: intent === "draft" ? null : {
        method: "POST",
        href: `/analysis-runs/${created.analysisRunId}/run`,
        module: "analysis-orchestrator.v1",
      },
      schemaVersion: created.normalized.sourceSchemaVersion,
      methodologyVersion: ANALYSIS_RESULT_METHODOLOGY_VERSION,
      input: created.normalized.input,
      idempotentReplay: created.idempotentReplay,
    });
  } catch (error) {
    handleDiagnosticError(error, res);
  }
});

router.get("/diagnostics/:diagnosticId", requireAuth, async (req, res) => {
  const params = GetDiagnosticParams.parse(req.params);
  try {
    const record = await getDiagnosticRecord(params.diagnosticId, req.authUser!);
    res.status(200).json(record);
  } catch (error) {
    handleDiagnosticError(error, res);
  }
});

router.post("/diagnostics/:diagnosticId/submit", requireAuth, async (req, res) => {
  const params = SubmitDiagnosticDraftParams.parse(req.params);
  const rawBody = SubmitDiagnosticDraftBody.parse(req.body);
  const { sessionId: rawSessionId, ...payload } = rawBody;
  const sessionId = typeof rawSessionId === "string" && rawSessionId ? rawSessionId : undefined;
  try {
    const updated = await updateDiagnosticDraft({
      actor: req.authUser!,
      diagnosticId: params.diagnosticId,
      payload,
      submit: true,
      sessionId,
    });
    res.status(200).json({
      clientId: updated.clientId ?? null,
      diagnosticId: updated.diagnosticId,
      analysisRunId: updated.analysisRunId,
      status: updated.status,
      nextStep: {
        method: "POST",
        href: `/analysis-runs/${updated.analysisRunId}/run`,
        module: "analysis-orchestrator.v1",
      },
      schemaVersion: updated.normalized.sourceSchemaVersion,
      methodologyVersion: ANALYSIS_RESULT_METHODOLOGY_VERSION,
      input: updated.normalized.input,
      idempotentReplay: updated.idempotentReplay,
    });
  } catch (error) {
    handleDiagnosticError(error, res);
  }
});

router.post("/diagnostics/situation-summary", requireAuth, async (req, res) => {
  const body = GenerateSituationSummaryBody.parse(req.body);
  try {
    const summary = await generateSituationSummary(body.answers, process.env, body.sessionId);
    res.status(200).json({
      text: summary.text,
      source: summary.source,
    });
  } catch (error) {
    if (error instanceof SituationSummaryConfigurationError) {
      res.status(503).json({ error: "situation_summary_unavailable", message: error.message });
      return;
    }
    if (error instanceof SituationSummaryGenerationError) {
      res.status(502).json({ error: "situation_summary_generation_failed", message: error.message });
      return;
    }
    throw error;
  }
});

export default router;
