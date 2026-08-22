import { DiagnosticContractError } from "@/lib/diagnostic-input";
import { AppAuthError } from "@/server/auth";
import { authErrorResponse } from "@/server/auth/http";
import { DiagnosticAccessError } from "./service";

export function diagnosticErrorResponse(error: unknown): Response {
  if (error instanceof AppAuthError) return authErrorResponse(error);
  if (error instanceof DiagnosticAccessError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof DiagnosticContractError) {
    return Response.json({ error: "invalid_diagnostic_input", issues: error.issues }, { status: 422 });
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const message = error instanceof Error ? error.message : "Unexpected storage error";
  if (message.includes("no such table")) {
    return Response.json({
      error: "diagnostic_storage_not_migrated",
      message: "Хранилище диагностики ещё не мигрировано.",
    }, { status: 503 });
  }
  return Response.json({ error: "diagnostic_storage_failed", message: "Не удалось сохранить разбор." }, { status: 500 });
}
