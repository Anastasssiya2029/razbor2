// Real cost/time reporting for architects, derived at read time from the
// immutable ai_call_log rows (every actual outbound AI provider request,
// success or failure, including retries). Nothing here is stored or mutated
// -- refreshing the dashboard or detail panel simply re-aggregates the same
// append-only rows, so results are always consistent with what actually
// happened on the wire.
import { aiCallLogTable, analysisRunsTable, db, type AiCallLog, type AnalysisRun } from "@workspace/db";
import { asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { AnalysisRunCostAttempt, AnalysisRunCostDetail, AnalysisRunCostModule } from "@workspace/api-zod";

// Fixed conversion rate for displaying provider cost (USD) as rubles, per
// the task brief. Not a live FX rate -- if that's ever needed, this is the
// single place to change it.
export const USD_TO_RUB_RATE = 95;

export interface RunCostSummary {
  costUsd: number;
  costRub: number;
  durationMs: number;
  hasData: boolean;
}

function summarize(rows: AiCallLog[]): RunCostSummary {
  if (rows.length === 0) {
    return { costUsd: 0, costRub: 0, durationMs: 0, hasData: false };
  }
  let costUsd = 0;
  let earliestStart = rows[0]!.startedAt.getTime();
  let latestEnd = rows[0]!.completedAt.getTime();
  for (const row of rows) {
    if (typeof row.costUsd === "number") costUsd += row.costUsd;
    earliestStart = Math.min(earliestStart, row.startedAt.getTime());
    latestEnd = Math.max(latestEnd, row.completedAt.getTime());
  }
  return {
    costUsd,
    costRub: costUsd * USD_TO_RUB_RATE,
    durationMs: Math.max(0, latestEnd - earliestStart),
    hasData: true,
  };
}

/**
 * Loads run-level cost/duration summaries for many runs at once (for the
 * dashboard list view). Runs with no ai_call_log rows (legacy runs, or runs
 * that never made a real provider call) come back with hasData: false so the
 * caller can render "no data" instead of a fake zero.
 */
export async function getCostSummaryByRunIds(runIds: string[]): Promise<Map<string, RunCostSummary>> {
  const map = new Map<string, RunCostSummary>();
  if (runIds.length === 0) return map;
  const rows = await db.select().from(aiCallLogTable).where(inArray(aiCallLogTable.analysisRunId, runIds));
  const byRun = new Map<string, AiCallLog[]>();
  for (const row of rows) {
    // The inArray(analysisRunId, runIds) filter above guarantees a non-null
    // id here; analysisRunId is only ever null for unlinked situation-summary
    // rows, which can't match a real run id.
    if (!row.analysisRunId) continue;
    const list = byRun.get(row.analysisRunId);
    if (list) list.push(row);
    else byRun.set(row.analysisRunId, [row]);
  }
  for (const runId of runIds) {
    map.set(runId, summarize(byRun.get(runId) ?? []));
  }
  return map;
}

/**
 * Cost of situation-summary calls that never got attached to a real
 * analysis run (the client opened the form, an OpenRouter call was made,
 * but the diagnostic was never submitted). Not tied to any one run, so it
 * can't appear in a per-run total -- surfaced instead as a standalone
 * architect-facing figure so this real spend is never simply invisible.
 */
export async function getUnlinkedSituationSummaryCost(): Promise<RunCostSummary & { callCount: number }> {
  const rows = await db.select().from(aiCallLogTable).where(isNull(aiCallLogTable.analysisRunId));
  return { ...summarize(rows), callCount: rows.length };
}

// How many of the most recently completed runs to average over when
// estimating a "typical" analysis duration for the client-facing waiting
// screen. Recent runs track the current pipeline/model mix better than an
// all-time average would once prompts/models change.
const AVERAGE_DURATION_SAMPLE_SIZE = 20;

export interface AverageRunDuration {
  averageDurationMs: number | null;
  sampleSize: number;
}

/**
 * Typical wall-clock duration of a full analysis run, estimated from the
 * ai_call_log spans (earliest provider call start to latest provider call
 * end) of the most recently completed ("ready") runs. Used to calibrate the
 * waiting-screen progress estimate against real historical behavior instead
 * of a guessed constant. Returns hasData:false-equivalent (null) when there
 * isn't at least one completed run with real call-log data yet (e.g. a
 * fresh environment), so the caller can fall back to a fixed estimate.
 */
export async function getAverageCompletedRunDuration(): Promise<AverageRunDuration> {
  const recentRuns = await db
    .select({ id: analysisRunsTable.id })
    .from(analysisRunsTable)
    .where(eq(analysisRunsTable.status, "ready"))
    .orderBy(desc(analysisRunsTable.createdAt))
    .limit(AVERAGE_DURATION_SAMPLE_SIZE);
  if (recentRuns.length === 0) return { averageDurationMs: null, sampleSize: 0 };

  const runIds = recentRuns.map((run) => run.id);
  const summaries = await getCostSummaryByRunIds(runIds);
  const durations = runIds
    .map((id) => summaries.get(id))
    .filter((summary): summary is RunCostSummary => !!summary?.hasData)
    .map((summary) => summary.durationMs);
  if (durations.length === 0) return { averageDurationMs: null, sampleSize: 0 };

  const averageDurationMs = durations.reduce((sum, ms) => sum + ms, 0) / durations.length;
  return { averageDurationMs, sampleSize: durations.length };
}

const MODULES = ["p01", "p02", "p03", "p04", "situation_summary"] as const;

/**
 * Full run + per-module + per-attempt breakdown for the architect-only
 * detail panel. Every attempt recorded in ai_call_log is included, whether
 * it succeeded, failed, or was retried.
 */
export async function getCostDetailForRun(run: AnalysisRun): Promise<AnalysisRunCostDetail> {
  const rows = await db
    .select()
    .from(aiCallLogTable)
    .where(eq(aiCallLogTable.analysisRunId, run.id))
    .orderBy(asc(aiCallLogTable.startedAt));

  const summary = summarize(rows);

  const byModule = new Map<string, AiCallLog[]>();
  for (const row of rows) {
    const list = byModule.get(row.module);
    if (list) list.push(row);
    else byModule.set(row.module, [row]);
  }

  const modules: AnalysisRunCostModule[] = MODULES.map((module) => {
    const moduleRows = (byModule.get(module) ?? []).slice().sort((a, b) => a.attemptIndex - b.attemptIndex);
    const moduleSummary = summarize(moduleRows);
    const attempts: AnalysisRunCostAttempt[] = moduleRows.map((row) => ({
      attemptIndex: row.attemptIndex,
      provider: row.provider,
      model: row.model,
      status: row.status === "success" ? "success" : "error",
      httpStatus: row.httpStatus,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      totalTokens: row.totalTokens,
      costUsd: row.costUsd,
      latencyMs: row.latencyMs,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
    }));
    const lastAttempt = moduleRows[moduleRows.length - 1];
    return {
      module,
      finalStatus: lastAttempt?.status ?? null,
      retryCount: Math.max(0, moduleRows.length - 1),
      totalCostUsd: moduleSummary.hasData ? moduleSummary.costUsd : null,
      totalCostRub: moduleSummary.hasData ? moduleSummary.costRub : null,
      totalTokens: moduleRows.length
        ? moduleRows.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0)
        : null,
      totalDurationMs: moduleSummary.hasData ? moduleSummary.durationMs : null,
      attempts,
    };
  });

  return {
    analysisRunId: run.id,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: summary.hasData ? rows[0]!.startedAt : null,
    completedAt: summary.hasData
      ? rows.reduce((latest, r) => (r.completedAt > latest ? r.completedAt : latest), rows[0]!.completedAt)
      : null,
    durationMs: summary.hasData ? summary.durationMs : null,
    totalCostUsd: summary.hasData ? summary.costUsd : null,
    totalCostRub: summary.hasData ? summary.costRub : null,
    totalTokens: rows.length ? rows.reduce((sum, r) => sum + (r.totalTokens ?? 0), 0) : null,
    hasData: summary.hasData,
    modules,
  };
}
