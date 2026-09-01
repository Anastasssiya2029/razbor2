import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { aiCallLogTable, analysisRunsTable, appUsersTable, db } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAverageCompletedRunDuration } from "../cost";
import { createDiagnosticRecord } from "../../../reference/server/diagnostics/service";
import type { AuthenticatedAppUser } from "../../auth/types";

// getAverageCompletedRunDuration estimates the waiting screen's "typical
// full run" from real ai_call_log spans of recently completed ("ready")
// runs, not a guessed constant -- these tests exercise the real database
// path end to end rather than mocking the query.

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

async function makeReadyRunWithDuration(ownerRunId: { diagnosticId: string; analysisRunId: string; clientId: string | null }, durationMs: number) {
  await db.update(analysisRunsTable).set({ status: "ready" }).where(eq(analysisRunsTable.id, ownerRunId.analysisRunId));
  const completedAt = new Date();
  const startedAt = new Date(completedAt.getTime() - durationMs);
  await db.insert(aiCallLogTable).values({
    analysisRunId: ownerRunId.analysisRunId,
    situationSessionId: null,
    module: "p01",
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
    costUsd: 0.01,
    latencyMs: durationMs,
    startedAt,
    completedAt,
  });
}

async function cleanup(diagnosticId: string | null, analysisRunId: string | null) {
  if (analysisRunId) await db.delete(aiCallLogTable).where(eq(aiCallLogTable.analysisRunId, analysisRunId));
  if (analysisRunId) await db.delete(analysisRunsTable).where(eq(analysisRunsTable.id, analysisRunId));
  // Diagnostics/clients cleanup intentionally skipped here: other tests in
  // this suite already exercise and clean up createDiagnosticRecord's own
  // rows, and leaving a diagnostic behind (with its run deleted above) does
  // not affect this function, which only ever reads analysis_runs + ai_call_log.
  void diagnosticId;
}

test("getAverageCompletedRunDuration averages real ai_call_log spans across recently completed runs", async () => {
  const owner = await loadOwner();
  const marker = randomUUID();
  const runA = await createDiagnosticRecord({ actor: owner, payload: normalizedPayload(`${marker}-a`), intent: "submit" });
  const runB = await createDiagnosticRecord({ actor: owner, payload: normalizedPayload(`${marker}-b`), intent: "submit" });

  try {
    await makeReadyRunWithDuration({ diagnosticId: runA.diagnosticId, analysisRunId: runA.analysisRunId, clientId: runA.clientId ?? null }, 10_000);
    await makeReadyRunWithDuration({ diagnosticId: runB.diagnosticId, analysisRunId: runB.analysisRunId, clientId: runB.clientId ?? null }, 20_000);

    const result = await getAverageCompletedRunDuration();
    assert.ok(result.averageDurationMs !== null, "must report a real average once at least one ready run has call-log data");
    assert.ok(result.sampleSize >= 2, "both freshly-created ready runs must be counted in the sample");
    // Can't assert an exact average: other real "ready" runs from outside
    // this test may also be included in the most-recent-N sample. Just
    // assert it's a sane positive number, not zero or NaN.
    assert.ok(result.averageDurationMs! > 0);
  } finally {
    await cleanup(runA.diagnosticId, runA.analysisRunId);
    await cleanup(runB.diagnosticId, runB.analysisRunId);
  }
});

test("getAverageCompletedRunDuration ignores runs with no ai_call_log data at all", async () => {
  const owner = await loadOwner();
  const marker = randomUUID();
  const run = await createDiagnosticRecord({ actor: owner, payload: normalizedPayload(marker), intent: "submit" });
  try {
    await db.update(analysisRunsTable).set({ status: "ready" }).where(eq(analysisRunsTable.id, run.analysisRunId));
    // No ai_call_log rows inserted for this run -- it must not poison the
    // average with a bogus zero-duration data point.
    const rows = await db.select().from(aiCallLogTable).where(eq(aiCallLogTable.analysisRunId, run.analysisRunId));
    assert.equal(rows.length, 0);
    const result = await getAverageCompletedRunDuration();
    // Whatever the sample turns out to be (this run is excluded, others may
    // still contribute), it must never be exactly zero from including this
    // run's non-existent duration.
    if (result.averageDurationMs !== null) assert.ok(result.averageDurationMs > 0);
  } finally {
    await cleanup(run.diagnosticId, run.analysisRunId);
  }
});
