import { getDb } from "@/db";
import { analysisRuns } from "@/db/schema";
import {
  AnalysisPipelineError,
  analysisRunAccessErrorResponse,
  requireAnalysisRunAccess,
  runAnalysisPipeline,
} from "@/server/analysis-runs";
import { syncAnalysisToGoogleSheet } from "@/server/google-sheets";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    await requireAnalysisRunAccess(request, analysisRunId, { ownerOnly: true });
    const rows = await (await getDb())
      .select({ status: analysisRuns.status, errorCode: analysisRuns.errorCode })
      .from(analysisRuns)
      .where(eq(analysisRuns.id, analysisRunId))
      .limit(1);
    if (!rows[0]) return Response.json({ error: "ANALYSIS_RUN_NOT_FOUND" }, { status: 404 });
    return Response.json({ analysisRunId, ...rows[0] }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const accessResponse = analysisRunAccessErrorResponse(error);
    return accessResponse ?? Response.json({ error: "ANALYSIS_RUN_STATUS_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    await requireAnalysisRunAccess(request, analysisRunId, { ownerOnly: true });
    const execution = await runAnalysisPipeline(analysisRunId);
    const sheetSync = await syncAnalysisToGoogleSheet(analysisRunId);
    return Response.json({
      analysisRunId,
      status: execution.status,
      idempotentReplay: execution.idempotentReplay,
      result: execution.result,
      sheetSync: sheetSync.status,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const accessResponse = analysisRunAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof AnalysisPipelineError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return Response.json(
      { error: "ANALYSIS_PIPELINE_TECHNICAL_ERROR", message: "Не удалось завершить разбор. Повторите позже." },
      { status: 500 },
    );
  }
}
