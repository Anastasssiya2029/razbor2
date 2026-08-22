import { analysisRunAccessErrorResponse, requireAnalysisRunAccess } from "@/server/analysis-runs";
import { syncAnalysisToGoogleSheet } from "@/server/google-sheets";

type RouteContext = { params: Promise<{ analysisRunId: string }> };
export async function POST(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    await requireAnalysisRunAccess(request, analysisRunId);
    return Response.json(await syncAnalysisToGoogleSheet(analysisRunId));
  } catch (error) {
    return analysisRunAccessErrorResponse(error) ?? Response.json({ error: "SHEET_SYNC_FAILED" }, { status: 500 });
  }
}
