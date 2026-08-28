import {
  DIAGNOSTIC_SCHEMA_VERSION,
  METHODOLOGY_VERSION,
  normalizeDiagnosticSubmission,
} from "@/lib/diagnostic-input";
import { requireAuthenticatedUser } from "@/server/auth";
import { createDiagnosticRecord } from "@/server/diagnostics";
import { diagnosticErrorResponse } from "@/server/diagnostics/http";

const MAX_REQUEST_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  try {
    const actor = await requireAuthenticatedUser(request);
    const payload = await request.json();
    const intent = payload && typeof payload === "object" && (payload as Record<string, unknown>).intent === "draft"
      ? "draft"
      : "submit";
    const normalized = normalizeDiagnosticSubmission(payload);
    const created = await createDiagnosticRecord({ actor, normalized, intent });
    if (intent === "draft") {
      return Response.json(
        {
          clientId: created.clientId,
          diagnosticId: created.diagnosticId,
          analysisRunId: created.analysisRunId,
          status: "draft",
          nextStep: null,
          schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
          methodologyVersion: METHODOLOGY_VERSION,
          input: created.normalized.input,
          idempotentReplay: created.idempotentReplay,
        },
        { status: 201 },
      );
    }
    return Response.json(
      {
        clientId: created.clientId,
        diagnosticId: created.diagnosticId,
        analysisRunId: created.analysisRunId,
        status: "queued",
        nextStep: {
          method: "POST",
          href: `/api/analysis-runs/${created.analysisRunId}/p01`,
          module: "P-01.v1.4.2",
        },
        schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
        methodologyVersion: METHODOLOGY_VERSION,
        input: created.normalized.input,
        idempotentReplay: created.idempotentReplay,
      },
      { status: created.idempotentReplay ? 200 : 201 },
    );
  } catch (error) {
    return diagnosticErrorResponse(error);
  }
}
