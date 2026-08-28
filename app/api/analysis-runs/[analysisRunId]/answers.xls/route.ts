import {
  analysisRunAccessErrorResponse,
  requireAnalysisRunAccess,
} from "@/server/analysis-runs";
import {
  clientQuestionnaireFilename,
  createClientQuestionnaireSpreadsheetXml,
  loadClientQuestionnaireExportSource,
} from "@/server/exports";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    await requireAnalysisRunAccess(request, analysisRunId);
    const source = await loadClientQuestionnaireExportSource(analysisRunId);
    if (!source) {
      return Response.json(
        { error: "ANALYSIS_RUN_NOT_FOUND", message: "Разбор не найден." },
        { status: 404 },
      );
    }
    const body = createClientQuestionnaireSpreadsheetXml(source);
    const filename = clientQuestionnaireFilename(source.clientName);
    return new Response(`\ufeff${body}`, {
      headers: {
        "content-type": "application/vnd.ms-excel; charset=utf-8",
        "content-disposition": `attachment; filename="otvety-7k.xls"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return analysisRunAccessErrorResponse(error)
      ?? Response.json(
        { error: "QUESTIONNAIRE_EXPORT_FAILED", message: "Не удалось подготовить ответы клиента." },
        { status: 500 },
      );
  }
}
