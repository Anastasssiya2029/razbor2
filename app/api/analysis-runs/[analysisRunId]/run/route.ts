import { getDb } from "@/db";
import { analysisRuns, p01AnalysisResults } from "@/db/schema";
import {
  AnalysisPipelineError,
  advanceAnalysisPipeline,
  analysisRunAccessErrorResponse,
  getAnalysisPipelineLockStatus,
  getAnalysisOverview,
  requireAnalysisRunAccess,
} from "@/server/analysis-runs";
import { syncAnalysisToGoogleSheet } from "@/server/google-sheets";
import {
  parseStoredP01FailureDetails,
  recoverP01FailureDetails,
} from "@/server/p01/failure-diagnostics";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    await requireAnalysisRunAccess(request, analysisRunId, { ownerOnly: true });
    const db = await getDb();
    const rows = await db
      .select({ status: analysisRuns.status, errorCode: analysisRuns.errorCode })
      .from(analysisRuns)
      .where(eq(analysisRuns.id, analysisRunId))
      .limit(1);
    if (!rows[0]) return Response.json({ error: "ANALYSIS_RUN_NOT_FOUND" }, { status: 404 });
    let failureDetails: Array<{ path: string; code: string; message: string }> = [];
    if (rows[0].status === "analysis_failed" && rows[0].errorCode?.startsWith("P01_")) {
      const stored = await db
        .select({
          raw: p01AnalysisResults.providerRawResponseJson,
          failureDetailsJson: p01AnalysisResults.failureDetailsJson,
        })
        .from(p01AnalysisResults)
        .where(eq(p01AnalysisResults.analysisRunId, analysisRunId))
        .limit(1);
      failureDetails = parseStoredP01FailureDetails(stored[0]?.failureDetailsJson ?? null);
      if (failureDetails.length === 0 && stored[0]?.raw) {
        try {
          failureDetails = recoverP01FailureDetails(
            rows[0].errorCode,
            JSON.parse(stored[0].raw) as unknown,
          );
        } catch {
          failureDetails = [];
        }
      }
    }
    const validationIssues = failureDetails.map(({ path, code }) => ({ path, code }));
    const lock = await getAnalysisPipelineLockStatus(analysisRunId);
    return Response.json(
      { analysisRunId, ...rows[0], validationIssues, failureDetails, ...lock },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const accessResponse = analysisRunAccessErrorResponse(error);
    return accessResponse ?? Response.json({ error: "ANALYSIS_RUN_STATUS_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    await requireAnalysisRunAccess(request, analysisRunId, { ownerOnly: true });
    const execution = await advanceAnalysisPipeline(analysisRunId);
    const overview = execution.status === "targeting"
      ? null
      : await getAnalysisOverview(analysisRunId);
    const sheetSync = execution.status === "ready"
      ? await syncAnalysisToGoogleSheet(analysisRunId)
      : null;
    return Response.json({
      analysisRunId,
      status: execution.status,
      idempotentReplay: execution.idempotentReplay,
      overview,
      result: execution.result,
      sheetSync: sheetSync?.status ?? "not_ready",
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const accessResponse = analysisRunAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof AnalysisPipelineError) {
      return Response.json({
        error: error.code,
        message: error.message,
        retryAfterSeconds: error.retryAfterSeconds,
      }, {
        status: error.status,
        headers: error.retryAfterSeconds
          ? { "retry-after": String(error.retryAfterSeconds) }
          : undefined,
      });
    }
    return Response.json(
      { error: "ANALYSIS_PIPELINE_TECHNICAL_ERROR", message: "Не удалось завершить разбор. Повторите позже." },
      { status: 500 },
    );
  }
}
