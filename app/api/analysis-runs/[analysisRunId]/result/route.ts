import { getOrCreateAnalysisResult } from "@/server/analysis-result";
import {
  analysisRunAccessErrorResponse,
  getAnalysisOverview,
  requireAnalysisRunAccess,
} from "@/server/analysis-runs";
import { getAnalysisCoverContext } from "@/server/analyses";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    await requireAnalysisRunAccess(request, analysisRunId);
    const assembled = await getOrCreateAnalysisResult(analysisRunId);
    return Response.json({
      analysisRunId,
      status: "ready",
      result: assembled.result,
      overview: await getAnalysisOverview(analysisRunId),
      cover: await getAnalysisCoverContext(analysisRunId),
    }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const accessResponse = analysisRunAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    return Response.json(
      { error: "ANALYSIS_RESULT_NOT_READY", message: "Результат разбора ещё не готов." },
      { status: 409 },
    );
  }
}
