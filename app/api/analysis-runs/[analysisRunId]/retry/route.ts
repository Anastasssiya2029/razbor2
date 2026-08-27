import {
  AnalysisPipelineError,
  analysisRunAccessErrorResponse,
  getAnalysisOverview,
  requireAnalysisRunAccess,
  retryFailedP02Pipeline,
} from "@/server/analysis-runs";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    await requireAnalysisRunAccess(request, analysisRunId, { ownerOnly: true });
    const execution = await retryFailedP02Pipeline(analysisRunId);
    return Response.json({
      analysisRunId,
      status: execution.status,
      idempotentReplay: execution.idempotentReplay,
      overview: await getAnalysisOverview(analysisRunId),
      result: execution.result,
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
      { error: "ANALYSIS_RETRY_TECHNICAL_ERROR", message: "Не удалось повторно собрать стратегию." },
      { status: 500 },
    );
  }
}
