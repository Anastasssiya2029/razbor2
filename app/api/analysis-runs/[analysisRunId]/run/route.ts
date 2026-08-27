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
  P01InvariantError,
  P01SchemaValidationError,
  validateP01Invariants,
  validateP01Schema,
} from "@/server/p01/validation";
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
    let validationIssues: Array<{ path: string; code: string }> = [];
    if (rows[0].status === "analysis_failed" && rows[0].errorCode?.startsWith("P01_")) {
      const stored = await db
        .select({ raw: p01AnalysisResults.providerRawResponseJson })
        .from(p01AnalysisResults)
        .where(eq(p01AnalysisResults.analysisRunId, analysisRunId))
        .limit(1);
      try {
        const provider = stored[0]?.raw ? JSON.parse(stored[0].raw) as Record<string, unknown> : null;
        const choices = provider?.choices as Array<{ message?: { content?: unknown } }> | undefined;
        const content = choices?.[0]?.message?.content;
        if (typeof content === "string") {
          const parsed = validateP01Schema(JSON.parse(content));
          validateP01Invariants(parsed);
        }
      } catch (error) {
        if (error instanceof P01SchemaValidationError || error instanceof P01InvariantError) {
          validationIssues = error.issues.slice(0, 30).map(({ path, code }) => ({ path, code }));
        }
      }
    }
    const lock = await getAnalysisPipelineLockStatus(analysisRunId);
    return Response.json(
      { analysisRunId, ...rows[0], validationIssues, ...lock },
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
