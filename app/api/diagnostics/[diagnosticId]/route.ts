import { requireAuthenticatedUser } from "@/server/auth";
import { getDiagnosticRecord, updateDiagnosticDraft } from "@/server/diagnostics";
import { diagnosticErrorResponse } from "@/server/diagnostics/http";

type RouteContext = { params: Promise<{ diagnosticId: string }> };
const MAX_REQUEST_BYTES = 256 * 1024;

export async function GET(request: Request, context: RouteContext) {
  try {
    const actor = await requireAuthenticatedUser(request);
    const { diagnosticId } = await context.params;
    return Response.json(await getDiagnosticRecord(diagnosticId, actor), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return diagnosticErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413 });
  try {
    const actor = await requireAuthenticatedUser(request);
    const { diagnosticId } = await context.params;
    const updated = await updateDiagnosticDraft({
      actor,
      diagnosticId,
      payload: await request.json(),
      submit: false,
    });
    return Response.json({
      diagnosticId: updated.diagnosticId,
      analysisRunId: updated.analysisRunId,
      status: updated.status,
      input: updated.normalized.input,
    });
  } catch (error) {
    return diagnosticErrorResponse(error);
  }
}
