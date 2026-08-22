import { requireAuthenticatedUser } from "@/server/auth";
import { authErrorResponse } from "@/server/auth/http";
import { ANALYSIS_EXPORT_HEADERS, buildAnalysisExportRow, createSpreadsheetXml, loadAnalysisExportSources } from "@/server/exports";

export async function GET(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const sources = await loadAnalysisExportSources(actor);
    const body = createSpreadsheetXml(ANALYSIS_EXPORT_HEADERS, sources.map(buildAnalysisExportRow));
    return new Response(`\ufeff${body}`, { headers: {
      "content-type": "application/vnd.ms-excel; charset=utf-8",
      "content-disposition": `attachment; filename="razbory-7k-${new Date().toISOString().slice(0, 10)}.xls"`,
      "cache-control": "private, no-store",
    } });
  } catch (error) { return authErrorResponse(error); }
}
