import { getDb } from "@/db";
import { analysisResults, analysisRuns, clients, diagnostics } from "@/db/schema";
import type { DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import type { AnalysisResultV1 } from "@/server/analysis-result";
import { canViewAllAnalyses, type AuthenticatedAppUser } from "@/server/auth";
import { desc, eq } from "drizzle-orm";
import type { AnalysisExportSource } from "./analysis-row";
import type { ClientQuestionnaireExportSource } from "./client-questionnaire";

export async function loadAnalysisExportSources(actor: AuthenticatedAppUser): Promise<AnalysisExportSource[]> {
  const db = await getDb();
  const base = db.select({
    analysisRunId: analysisRuns.id, createdAt: analysisRuns.createdAt,
    rawPayload: diagnostics.rawAnswersJson, input: diagnostics.normalizedInputJson, result: analysisResults.resultJson,
  }).from(analysisRuns)
    .innerJoin(diagnostics, eq(analysisRuns.diagnosticId, diagnostics.id))
    .innerJoin(analysisResults, eq(analysisResults.analysisRunId, analysisRuns.id));
  const rows = canViewAllAnalyses(actor.role)
    ? await base.orderBy(desc(analysisRuns.createdAt)).limit(5000)
    : await base.where(eq(diagnostics.ownerUserId, actor.id)).orderBy(desc(analysisRuns.createdAt)).limit(5000);
  return rows.map((row) => ({
    analysisRunId: row.analysisRunId,
    createdAt: row.createdAt,
    rawPayload: JSON.parse(row.rawPayload),
    input: JSON.parse(row.input) as DiagnosticInputV1_2,
    result: JSON.parse(row.result) as AnalysisResultV1,
  }));
}

export async function loadAnalysisExportSource(analysisRunId: string): Promise<AnalysisExportSource | null> {
  const db = await getDb();
  const rows = await db.select({
    analysisRunId: analysisRuns.id, createdAt: analysisRuns.createdAt,
    rawPayload: diagnostics.rawAnswersJson, input: diagnostics.normalizedInputJson, result: analysisResults.resultJson,
  }).from(analysisRuns)
    .innerJoin(diagnostics, eq(analysisRuns.diagnosticId, diagnostics.id))
    .innerJoin(analysisResults, eq(analysisResults.analysisRunId, analysisRuns.id))
    .where(eq(analysisRuns.id, analysisRunId)).limit(1);
  const row = rows[0];
  return row ? { analysisRunId: row.analysisRunId, createdAt: row.createdAt, rawPayload: JSON.parse(row.rawPayload), input: JSON.parse(row.input), result: JSON.parse(row.result) } : null;
}

export async function loadClientQuestionnaireExportSource(
  analysisRunId: string,
): Promise<ClientQuestionnaireExportSource | null> {
  const db = await getDb();
  const rows = await db
    .select({
      analysisRunId: analysisRuns.id,
      createdAt: analysisRuns.createdAt,
      clientName: clients.displayName,
      rawPayload: diagnostics.rawAnswersJson,
      input: diagnostics.normalizedInputJson,
    })
    .from(analysisRuns)
    .innerJoin(diagnostics, eq(analysisRuns.diagnosticId, diagnostics.id))
    .leftJoin(clients, eq(diagnostics.clientId, clients.id))
    .where(eq(analysisRuns.id, analysisRunId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const input = JSON.parse(row.input) as DiagnosticInputV1_2;
  return {
    analysisRunId: row.analysisRunId,
    createdAt: row.createdAt,
    clientName: row.clientName ?? input.identity.expertName ?? "Без имени",
    rawPayload: JSON.parse(row.rawPayload),
    input,
  };
}
