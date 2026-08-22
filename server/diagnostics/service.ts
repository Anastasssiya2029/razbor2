import { getDb } from "@/db";
import { analysisRuns, clients, diagnostics } from "@/db/schema";
import {
  DIAGNOSTIC_SCHEMA_VERSION,
  METHODOLOGY_VERSION,
  normalizeDiagnosticSubmission,
  type NormalizedDiagnosticSubmission,
} from "@/lib/diagnostic-input";
import { canAccessOwnedAnalysis, type AuthenticatedAppUser } from "@/server/auth";
import { and, desc, eq } from "drizzle-orm";

export class DiagnosticAccessError extends Error {
  constructor(
    readonly code: "DIAGNOSTIC_NOT_FOUND" | "DIAGNOSTIC_FORBIDDEN" | "DIAGNOSTIC_NOT_DRAFT",
    readonly status: 403 | 404 | 409,
    message: string,
  ) {
    super(message);
    this.name = "DiagnosticAccessError";
  }
}

function clientDisplayName(normalized: NormalizedDiagnosticSubmission): string {
  return normalized.input.identity.expertName?.trim() || "Без имени";
}

export async function createDiagnosticRecord(input: {
  actor: AuthenticatedAppUser;
  payload?: unknown;
  normalized?: NormalizedDiagnosticSubmission;
  intent: "draft" | "submit";
}) {
  const normalized = input.normalized ?? normalizeDiagnosticSubmission(input.payload);
  const clientId = crypto.randomUUID();
  const diagnosticId = crypto.randomUUID();
  const analysisRunId = crypto.randomUUID();
  const db = await getDb();
  await db.batch([
    db.insert(clients).values({
      id: clientId,
      displayName: clientDisplayName(normalized),
      niche: normalized.input.identity.niche,
      createdByUserId: input.actor.id,
    }),
    db.insert(diagnostics).values({
      id: diagnosticId,
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      sourceSchemaVersion: normalized.sourceSchemaVersion,
      methodologyVersion: METHODOLOGY_VERSION,
      clientId,
      ownerUserId: input.actor.id,
      rawAnswersJson: JSON.stringify(normalized.rawPayload),
      normalizedInputJson: JSON.stringify(normalized.input),
    }),
    db.insert(analysisRuns).values({
      id: analysisRunId,
      diagnosticId,
      status: input.intent === "draft" ? "draft" : "queued",
      schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      methodologyVersion: METHODOLOGY_VERSION,
      promptVersionsJson: "{}",
      modelMetadataJson: "{}",
    }),
  ]);
  return { clientId, diagnosticId, analysisRunId, normalized };
}

async function loadEditableDiagnostic(diagnosticId: string, actor: AuthenticatedAppUser) {
  const db = await getDb();
  const rows = await db
    .select({ diagnostic: diagnostics, run: analysisRuns, client: clients })
    .from(diagnostics)
    .innerJoin(analysisRuns, eq(analysisRuns.diagnosticId, diagnostics.id))
    .leftJoin(clients, eq(diagnostics.clientId, clients.id))
    .where(eq(diagnostics.id, diagnosticId))
    .orderBy(desc(analysisRuns.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) throw new DiagnosticAccessError("DIAGNOSTIC_NOT_FOUND", 404, "Разбор не найден.");
  if (!canAccessOwnedAnalysis(actor.role, actor.id, row.diagnostic.ownerUserId)) {
    throw new DiagnosticAccessError("DIAGNOSTIC_FORBIDDEN", 403, "Нет доступа к разбору.");
  }
  return row;
}

export async function updateDiagnosticDraft(input: {
  actor: AuthenticatedAppUser;
  diagnosticId: string;
  payload: unknown;
  submit: boolean;
}) {
  const current = await loadEditableDiagnostic(input.diagnosticId, input.actor);
  if (current.diagnostic.ownerUserId !== input.actor.id) {
    throw new DiagnosticAccessError("DIAGNOSTIC_FORBIDDEN", 403, "Редактировать черновик может только его автор.");
  }
  if (current.run.status !== "draft") {
    throw new DiagnosticAccessError("DIAGNOSTIC_NOT_DRAFT", 409, "Запущенный разбор нельзя изменить как черновик.");
  }
  const normalized = normalizeDiagnosticSubmission(input.payload);
  const db = await getDb();
  const now = new Date().toISOString();
  const diagnosticUpdate = db.update(diagnostics).set({
      sourceSchemaVersion: normalized.sourceSchemaVersion,
      rawAnswersJson: JSON.stringify(normalized.rawPayload),
      normalizedInputJson: JSON.stringify(normalized.input),
      updatedAt: now,
    }).where(and(eq(diagnostics.id, input.diagnosticId), eq(diagnostics.ownerUserId, current.diagnostic.ownerUserId)));
  const runUpdate = db.update(analysisRuns).set({
      status: input.submit ? "queued" : "draft",
      updatedAt: now,
    }).where(eq(analysisRuns.id, current.run.id));
  if (current.client) {
    const clientUpdate = db.update(clients).set({
        displayName: clientDisplayName(normalized),
        niche: normalized.input.identity.niche,
        updatedAt: now,
      }).where(eq(clients.id, current.client.id));
    await db.batch([diagnosticUpdate, runUpdate, clientUpdate]);
  } else {
    await db.batch([diagnosticUpdate, runUpdate]);
  }
  return {
    clientId: current.client?.id ?? null,
    diagnosticId: current.diagnostic.id,
    analysisRunId: current.run.id,
    status: input.submit ? "queued" as const : "draft" as const,
    normalized,
  };
}

export async function getDiagnosticRecord(diagnosticId: string, actor: AuthenticatedAppUser) {
  const current = await loadEditableDiagnostic(diagnosticId, actor);
  return {
    client: current.client ? {
      id: current.client.id,
      displayName: current.client.displayName,
      niche: current.client.niche,
    } : null,
    diagnosticId: current.diagnostic.id,
    analysisRunId: current.run.id,
    status: current.run.status,
    rawAnswers: JSON.parse(current.diagnostic.rawAnswersJson),
    input: JSON.parse(current.diagnostic.normalizedInputJson),
    createdAt: current.diagnostic.createdAt,
    updatedAt: current.diagnostic.updatedAt,
  };
}
