import {
  AnalysisResultError,
  authorizeAnalysisResultDebugRequest,
  getOrCreateAnalysisResult,
  loadAnalysisResultDebugEnvironment,
} from "@/server/analysis-result";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

/**
 * Fail-closed internal/debug endpoint. It is disabled by default and exposes
 * no raw diagnostic input, provider response, candidate ranking or secret.
 */
export async function GET(request: Request, context: RouteContext) {
  const guard = authorizeAnalysisResultDebugRequest(
    request,
    await loadAnalysisResultDebugEnvironment(),
  );
  if (!guard.allowed) {
    return Response.json({ error: guard.code, message: guard.message }, { status: guard.status });
  }
  const { analysisRunId } = await context.params;
  try {
    const assembled = await getOrCreateAnalysisResult(analysisRunId);
    return Response.json({
      result: assembled.result,
      idempotentReplay: assembled.idempotentReplay,
    });
  } catch (error) {
    if (error instanceof AnalysisResultError) {
      const status = error.kind === "not_found" ? 404 : error.kind === "not_ready" ? 409 : 422;
      return Response.json({
        error: error.code,
        message: status === 404 ? "Analysis run was not found." : "Final analysis result is unavailable.",
      }, { status });
    }
    return Response.json(
      { error: "ANALYSIS_RESULT_TECHNICAL_ERROR", message: "Final analysis result could not be assembled." },
      { status: 500 },
    );
  }
}
