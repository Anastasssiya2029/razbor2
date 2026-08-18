import { getDb } from "@/db";
import { analysisRuns, diagnostics } from "@/db/schema";
import {
  DIAGNOSTIC_SCHEMA_VERSION,
  DiagnosticContractError,
  METHODOLOGY_VERSION,
  normalizeDiagnosticSubmission,
} from "@/lib/diagnostic-input";

const MAX_REQUEST_BYTES = 256 * 1024;

function storageErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected storage error";
  if (message.includes("no such table")) {
    return "Хранилище диагностики ещё не мигрировано. Примените сгенерированную D1-миграцию.";
  }
  return message;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  }

  try {
    const payload = await request.json();
    const normalized = normalizeDiagnosticSubmission(payload);
    const diagnosticId = crypto.randomUUID();
    const analysisRunId = crypto.randomUUID();
    const db = await getDb();

    await db.batch([
      db.insert(diagnostics).values({
        id: diagnosticId,
        schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
        sourceSchemaVersion: normalized.sourceSchemaVersion,
        methodologyVersion: METHODOLOGY_VERSION,
        rawAnswersJson: JSON.stringify(normalized.rawPayload),
        normalizedInputJson: JSON.stringify(normalized.input),
      }),
      db.insert(analysisRuns).values({
        id: analysisRunId,
        diagnosticId,
        status: "queued",
        schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
        methodologyVersion: METHODOLOGY_VERSION,
        promptVersionsJson: "{}",
        modelMetadataJson: "{}",
      }),
    ]);

    return Response.json(
      {
        diagnosticId,
        analysisRunId,
        status: "queued",
        nextStep: {
          method: "POST",
          href: `/api/analysis-runs/${analysisRunId}/p01`,
          module: "P-01.v1.4",
        },
        schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
        methodologyVersion: METHODOLOGY_VERSION,
        input: normalized.input,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DiagnosticContractError) {
      return Response.json(
        { error: "invalid_diagnostic_input", issues: error.issues },
        { status: 422 },
      );
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }
    return Response.json(
      { error: "diagnostic_storage_failed", message: storageErrorMessage(error) },
      { status: 500 },
    );
  }
}
