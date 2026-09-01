import { analysisRunsTable as analysisRuns, clientsTable as clients, db, diagnosticsTable as diagnostics } from "@workspace/db";
import { hashOf } from "../../../domain/shared/hash";
import {
  DIAGNOSTIC_SCHEMA_VERSION,
  METHODOLOGY_VERSION,
  normalizeDiagnosticSubmission,
  type NormalizedDiagnosticSubmission,
} from "@/lib/diagnostic-input";
import { canAccessOwnedAnalysis } from "../../../domain/auth/policy";
import type { AuthenticatedAppUser } from "../../../domain/auth/types";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { reconcileSituationSummaryCallLogs } from "../ai/call-log";

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

const REUSABLE_ACTIVE_STATUSES = [
  "queued",
  "scoring",
  "targeting",
  "strategizing",
  "resolving_tasks",
  "money_now",
  "writing_report",
] as const;

async function findReusableActiveDiagnostic(input: {
  ownerUserId: string;
  normalizedInputHash: string;
  excludeDiagnosticId?: string;
}) {
  const filters = [
    eq(diagnostics.ownerUserId, input.ownerUserId),
    eq(diagnostics.normalizedInputHash, input.normalizedInputHash),
    sql`${analysisRuns.metadata}->>'methodologyVersion' = ${METHODOLOGY_VERSION}`,
    inArray(analysisRuns.status, REUSABLE_ACTIVE_STATUSES),
  ];
  if (input.excludeDiagnosticId) filters.push(ne(diagnostics.id, input.excludeDiagnosticId));
  const rows = await db
    .select({
      clientId: diagnostics.clientId,
      diagnosticId: diagnostics.id,
      analysisRunId: analysisRuns.id,
      status: analysisRuns.status,
    })
    .from(diagnostics)
    .innerJoin(analysisRuns, eq(analysisRuns.diagnosticId, diagnostics.id))
    .where(and(...filters))
    .orderBy(desc(analysisRuns.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function createDiagnosticRecord(input: {
  actor: AuthenticatedAppUser;
  payload?: unknown;
  normalized?: NormalizedDiagnosticSubmission;
  intent: "draft" | "submit";
  // Situation-summary form-session id (see ai/call-log.ts), if the client
  // sent one -- lets pre-submission OpenRouter spend for this diagnostic get
  // attributed to the real analysis run's cost total.
  sessionId?: string;
}) {
  const normalized = input.normalized ?? normalizeDiagnosticSubmission(input.payload);
  if (input.intent === "submit") {
    const reusable = await findReusableActiveDiagnostic({
      ownerUserId: input.actor.id,
      normalizedInputHash: hashOf(normalized.input),
    });
    if (reusable) {
      if (input.sessionId) await reconcileSituationSummaryCallLogs(input.sessionId, reusable.analysisRunId);
      return {
        ...reusable,
        normalized,
        idempotentReplay: true,
      };
    }
  }
  const clientId = crypto.randomUUID();
  const diagnosticId = crypto.randomUUID();
  const analysisRunId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(clients).values({
      id: clientId,
      ownerUserId: input.actor.id,
      displayName: clientDisplayName(normalized),
      niche: normalized.input.identity.niche,
    });
    await tx.insert(diagnostics).values({
      id: diagnosticId,
      inputSchemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
      clientId,
      ownerUserId: input.actor.id,
      rawAnswers: normalized.rawPayload as Record<string, unknown>,
      normalizedInput: normalized.input,
      normalizedInputHash: hashOf(normalized.input),
    });
    await tx.insert(analysisRuns).values({
      id: analysisRunId,
      diagnosticId,
      ownerUserId: input.actor.id,
      status: input.intent === "draft" ? "draft" : "queued",
      metadata: {
        inputSchemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
        sourceSchemaVersion: normalized.sourceSchemaVersion,
        methodologyVersion: METHODOLOGY_VERSION,
        promptVersionsJson: {},
        modelMetadataJson: {},
      },
    });
  });
  if (input.sessionId) await reconcileSituationSummaryCallLogs(input.sessionId, analysisRunId);
  return { clientId, diagnosticId, analysisRunId, normalized, idempotentReplay: false };
}

async function loadEditableDiagnostic(diagnosticId: string, actor: AuthenticatedAppUser) {
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
  // See createDiagnosticRecord's sessionId param -- the draft-submit flow is
  // a second, equally real path to a submitted diagnostic, so it needs the
  // same reconciliation.
  sessionId?: string;
}) {
  const current = await loadEditableDiagnostic(input.diagnosticId, input.actor);
  if (current.diagnostic.ownerUserId !== input.actor.id) {
    throw new DiagnosticAccessError("DIAGNOSTIC_FORBIDDEN", 403, "Редактировать черновик может только его автор.");
  }
  if (current.run.status !== "draft") {
    throw new DiagnosticAccessError("DIAGNOSTIC_NOT_DRAFT", 409, "Запущенный разбор нельзя изменить как черновик.");
  }
  const normalized = normalizeDiagnosticSubmission(input.payload);
  if (input.submit) {
    const reusable = await findReusableActiveDiagnostic({
      ownerUserId: input.actor.id,
      normalizedInputHash: hashOf(normalized.input),
      excludeDiagnosticId: input.diagnosticId,
    });
    if (reusable) {
      if (input.sessionId) await reconcileSituationSummaryCallLogs(input.sessionId, reusable.analysisRunId);
      return {
        ...reusable,
        status: "queued" as const,
        normalized,
        idempotentReplay: true,
      };
    }
  }
  await db.transaction(async (tx) => {
    await tx.update(diagnostics).set({
      rawAnswers: normalized.rawPayload as Record<string, unknown>,
      normalizedInput: normalized.input,
      normalizedInputHash: hashOf(normalized.input),
    }).where(and(eq(diagnostics.id, input.diagnosticId), eq(diagnostics.ownerUserId, current.diagnostic.ownerUserId)));
    await tx.update(analysisRuns).set({
      status: input.submit ? "queued" : "draft",
    }).where(eq(analysisRuns.id, current.run.id));
    if (current.client) {
      await tx.update(clients).set({
        displayName: clientDisplayName(normalized),
        niche: normalized.input.identity.niche,
      }).where(eq(clients.id, current.client.id));
    }
  });
  if (input.submit && input.sessionId) {
    await reconcileSituationSummaryCallLogs(input.sessionId, current.run.id);
  }
  return {
    clientId: current.client?.id ?? null,
    diagnosticId: current.diagnostic.id,
    analysisRunId: current.run.id,
    status: input.submit ? "queued" as const : "draft" as const,
    normalized,
    idempotentReplay: false,
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
    rawAnswers: current.diagnostic.rawAnswers,
    input: current.diagnostic.normalizedInput,
    createdAt: current.diagnostic.createdAt,
    updatedAt: current.diagnostic.updatedAt,
  };
}
