import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  aiCallLogTable,
  analysisRunsTable,
  appUsersTable,
  clientsTable,
  db,
  diagnosticsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { withCallLogging, reconcileSituationSummaryCallLogs, type GenericProvider } from "../../ai/call-log";
import { getCostDetailForRun, getCostSummaryByRunIds, getUnlinkedSituationSummaryCost } from "../../../../domain/analysis-pipeline/cost";
import { createDiagnosticRecord, updateDiagnosticDraft } from "../service";
import type { AuthenticatedAppUser } from "../../../../domain/auth/types";

// These tests exercise the real database path for the situation-summary cost
// gap this task closes: a call logged before any diagnostic exists (keyed by
// a form sessionId) must (a) actually be committed before the caller can
// move on, and (b) get attached to the real analysisRunId once the
// diagnostic is submitted, via BOTH supported submission routes
// (POST /diagnostics and POST /diagnostics/:id/submit). Without this, a
// client's real OpenRouter spend can be silently dropped from the cost
// total that's supposed to account for it.

const fakeProvider: GenericProvider = {
  provider: "openrouter",
  model: "test-model",
  async complete() {
    return {
      text: "{}",
      rawResponse: {},
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.01 },
    };
  },
};

async function loadOwner(): Promise<AuthenticatedAppUser> {
  const [owner] = await db.select().from(appUsersTable).limit(1);
  assert.ok(owner, "test DB must have at least one app_users row to attach a diagnostic to");
  return owner as unknown as AuthenticatedAppUser;
}

function normalizedPayload(uniqueMarker: string) {
  return {
    sourceSchemaVersion: "diagnostic-flat-form.v1.2",
    rawAnswers: {
      values: {
        expertName: `Test Expert ${uniqueMarker}`,
        niche: "test-niche",
        clientPath: "воронка",
        goalIncome: "500000",
        currentIncome: "100000",
      },
      deadline: "6 месяцев",
      clientsCountPeriod: "month",
      desiredSystemWeeklyHoursApplicable: false,
    },
  };
}

async function cleanupDiagnostic(diagnosticId: string | null, clientId: string | null) {
  if (diagnosticId) {
    const [run] = await db.select().from(analysisRunsTable).where(eq(analysisRunsTable.diagnosticId, diagnosticId));
    if (run) {
      await db.delete(aiCallLogTable).where(eq(aiCallLogTable.analysisRunId, run.id));
      await db.delete(analysisRunsTable).where(eq(analysisRunsTable.id, run.id));
    }
    await db.delete(diagnosticsTable).where(eq(diagnosticsTable.id, diagnosticId));
  }
  if (clientId) await db.delete(clientsTable).where(eq(clientsTable.id, clientId));
}

test("withCallLogging awaits the insert, so the row exists as soon as the caller's promise resolves", async () => {
  const sessionId = `test-session-${randomUUID()}`;
  const provider = withCallLogging(fakeProvider, {
    module: "situation_summary",
    analysisRunId: null,
    situationSessionId: sessionId,
  });
  await provider.complete({ systemPrompt: "x", outputSchema: {}, correction: null });

  // No artificial wait: if the insert were still fire-and-forget, this
  // immediate read could race it and find nothing.
  const rows = await db.select().from(aiCallLogTable).where(eq(aiCallLogTable.situationSessionId, sessionId));
  try {
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.analysisRunId, null);
    assert.equal(rows[0]!.module, "situation_summary");
  } finally {
    await db.delete(aiCallLogTable).where(eq(aiCallLogTable.situationSessionId, sessionId));
  }
});

test("createDiagnosticRecord (POST /diagnostics submit) reconciles unlinked situation-summary spend into the run's cost total", async () => {
  const owner = await loadOwner();
  const sessionId = `test-session-${randomUUID()}`;
  const provider = withCallLogging(fakeProvider, {
    module: "situation_summary",
    analysisRunId: null,
    situationSessionId: sessionId,
  });
  await provider.complete({ systemPrompt: "x", outputSchema: {}, correction: null });

  let diagnosticId: string | null = null;
  let clientId: string | null = null;
  try {
    const created = await createDiagnosticRecord({
      actor: owner,
      payload: normalizedPayload(sessionId),
      intent: "submit",
      sessionId,
    });
    diagnosticId = created.diagnosticId;
    clientId = created.clientId ?? null;

    const [row] = await db.select().from(aiCallLogTable).where(eq(aiCallLogTable.situationSessionId, sessionId));
    assert.equal(row, undefined, "row must be reconciled off the sessionId key, not still findable by it");

    const linkedRows = await db
      .select()
      .from(aiCallLogTable)
      .where(eq(aiCallLogTable.analysisRunId, created.analysisRunId));
    assert.equal(linkedRows.length, 1);
    assert.equal(linkedRows[0]!.situationSessionId, null);

    const [run] = await db.select().from(analysisRunsTable).where(eq(analysisRunsTable.id, created.analysisRunId));
    const detail = await getCostDetailForRun(run!);
    assert.equal(detail.hasData, true);
    assert.ok((detail.totalCostUsd ?? 0) > 0);
    const summaryModule = detail.modules.find((m) => m.module === "situation_summary");
    assert.ok(summaryModule, "situation_summary must appear in the per-module cost breakdown");
    assert.equal(summaryModule!.totalCostUsd, 0.01);

    const byRun = await getCostSummaryByRunIds([created.analysisRunId]);
    assert.equal(byRun.get(created.analysisRunId)!.hasData, true);
    assert.ok(byRun.get(created.analysisRunId)!.costUsd >= 0.01);
  } finally {
    await cleanupDiagnostic(diagnosticId, clientId);
  }
});

test("updateDiagnosticDraft (POST /diagnostics/:id/submit) also reconciles unlinked situation-summary spend", async () => {
  const owner = await loadOwner();
  const draftSessionId = `test-session-${randomUUID()}`;

  // Create a draft first (intent: draft never reconciles, matching the
  // create route's contract), then submit it via the separate draft-submit
  // path with a sessionId collected during the draft's own lifetime.
  let diagnosticId: string | null = null;
  let clientId: string | null = null;
  try {
    const draft = await createDiagnosticRecord({
      actor: owner,
      payload: normalizedPayload(`${draftSessionId}-draft`),
      intent: "draft",
    });
    diagnosticId = draft.diagnosticId;
    clientId = draft.clientId ?? null;

    const provider = withCallLogging(fakeProvider, {
      module: "situation_summary",
      analysisRunId: null,
      situationSessionId: draftSessionId,
    });
    await provider.complete({ systemPrompt: "x", outputSchema: {}, correction: null });

    const submitted = await updateDiagnosticDraft({
      actor: owner,
      diagnosticId: draft.diagnosticId,
      payload: normalizedPayload(`${draftSessionId}-submit`),
      submit: true,
      sessionId: draftSessionId,
    });
    assert.equal(submitted.analysisRunId, draft.analysisRunId);

    const linkedRows = await db
      .select()
      .from(aiCallLogTable)
      .where(eq(aiCallLogTable.analysisRunId, submitted.analysisRunId));
    assert.equal(linkedRows.length, 1);
    assert.equal(linkedRows[0]!.situationSessionId, null);
  } finally {
    await cleanupDiagnostic(diagnosticId, clientId);
  }
});

test("reconcileSituationSummaryCallLogs never touches rows already linked to a different run", async () => {
  const owner = await loadOwner();
  const sessionId = `test-session-${randomUUID()}`;

  let diagnosticId: string | null = null;
  let clientId: string | null = null;
  let otherDiagnosticId: string | null = null;
  let otherClientId: string | null = null;
  try {
    const otherRun = await createDiagnosticRecord({
      actor: owner,
      payload: normalizedPayload(`${sessionId}-other`),
      intent: "submit",
    });
    otherDiagnosticId = otherRun.diagnosticId;
    otherClientId = otherRun.clientId ?? null;

    // Simulate a row already reconciled to a prior run under an unrelated id.
    await db.insert(aiCallLogTable).values({
      analysisRunId: otherRun.analysisRunId,
      situationSessionId: null,
      module: "situation_summary",
      attemptIndex: 1,
      provider: "openrouter",
      model: "test-model",
      status: "success",
      httpStatus: 200,
      errorCode: null,
      errorMessage: null,
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
      costUsd: 0.02,
      latencyMs: 10,
      startedAt: new Date(),
      completedAt: new Date(),
    });

    const created = await createDiagnosticRecord({
      actor: owner,
      payload: normalizedPayload(sessionId),
      intent: "submit",
      sessionId,
    });
    diagnosticId = created.diagnosticId;
    clientId = created.clientId ?? null;

    const stillOnOtherRun = await db
      .select()
      .from(aiCallLogTable)
      .where(eq(aiCallLogTable.analysisRunId, otherRun.analysisRunId));
    assert.equal(stillOnOtherRun.length, 1, "reconciliation for an unrelated sessionId must not move this row");
  } finally {
    await cleanupDiagnostic(diagnosticId, clientId);
    await cleanupDiagnostic(otherDiagnosticId, otherClientId);
  }
});

test("getUnlinkedSituationSummaryCost surfaces spend that was never reconciled to any run", async () => {
  const sessionId = `test-session-${randomUUID()}`;
  const before = await getUnlinkedSituationSummaryCost();

  const provider = withCallLogging(fakeProvider, {
    module: "situation_summary",
    analysisRunId: null,
    situationSessionId: sessionId,
  });
  await provider.complete({ systemPrompt: "x", outputSchema: {}, correction: null });

  try {
    const after = await getUnlinkedSituationSummaryCost();
    assert.equal(after.callCount, before.callCount + 1);
    assert.ok(after.hasData);
  } finally {
    await db.delete(aiCallLogTable).where(eq(aiCallLogTable.situationSessionId, sessionId));
  }
});
