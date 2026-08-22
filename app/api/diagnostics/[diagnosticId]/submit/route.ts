import { requireAuthenticatedUser } from "@/server/auth";
import { updateDiagnosticDraft } from "@/server/diagnostics";
import { diagnosticErrorResponse } from "@/server/diagnostics/http";

type RouteContext = { params: Promise<{ diagnosticId: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { diagnosticId } = await context.params;
    const updated = await updateDiagnosticDraft({
      actor,
      diagnosticId,
      payload: await request.json(),
      submit: true,
    });
    return Response.json({
      diagnosticId: updated.diagnosticId,
      analysisRunId: updated.analysisRunId,
      status: updated.status,
      nextStep: {
        method: "POST",
        href: `/api/analysis-runs/${updated.analysisRunId}/run`,
        module: "analysis-orchestrator.v1",
      },
      input: updated.normalized.input,
    });
  } catch (error) {
    return diagnosticErrorResponse(error);
  }
}
