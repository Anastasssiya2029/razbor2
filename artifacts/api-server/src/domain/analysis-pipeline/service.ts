// Express-facing wrapper around the reference pipeline orchestrator
// (reference/server/analysis-runs/pipeline.ts), adapted from razbor2's
// Next.js route handlers to this project's Express route conventions.
import { db, analysisRunsTable, analysisResultsTable, type AnalysisRun } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  AnalysisPipelineError,
  advanceAnalysisPipeline,
  retryFailedAnalysisPipeline,
  retryFailedP02Pipeline,
  runAnalysisPipeline,
} from "../../reference/server/analysis-runs/pipeline";
import { getAnalysisOverview, type AnalysisOverview } from "../../reference/server/analysis-runs/overview";

export type { AnalysisOverview } from "../../reference/server/analysis-runs/overview";

export class PipelineServiceError extends Error {
  constructor(
    readonly status: 404 | 409 | 422,
    message: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "PipelineServiceError";
  }
}

function toServiceError(error: unknown): never {
  if (error instanceof AnalysisPipelineError) {
    throw new PipelineServiceError(error.status, error.message, error.retryAfterSeconds);
  }
  throw error;
}

/** Runs every remaining stage inline and returns once the result is ready (or throws). */
export async function startAnalysisRun(analysisRunId: string) {
  try {
    return await runAnalysisPipeline(analysisRunId);
  } catch (error) {
    toServiceError(error);
  }
}

/** Advances exactly one resumable step (used for polling-driven, step-by-step UIs). */
export async function advanceAnalysisRun(analysisRunId: string) {
  try {
    return await advanceAnalysisPipeline(analysisRunId);
  } catch (error) {
    toServiceError(error);
  }
}

export async function retryFailedStrategyStep(analysisRunId: string) {
  try {
    return await retryFailedP02Pipeline(analysisRunId);
  } catch (error) {
    toServiceError(error);
  }
}

export async function retryFailedStep(analysisRunId: string) {
  try {
    return await retryFailedAnalysisPipeline(analysisRunId);
  } catch (error) {
    toServiceError(error);
  }
}

export async function getAnalysisRun(analysisRunId: string): Promise<AnalysisRun | null> {
  const [row] = await db.select().from(analysisRunsTable).where(eq(analysisRunsTable.id, analysisRunId));
  return row ?? null;
}

// Early preview (archetype + current/target 7K scores), available once the
// targeting stage has persisted a stored target/archetype snapshot -- well
// before the full result (P-02..P-04) finishes. Returns null before that,
// so callers can attach it unconditionally to run responses.
export async function getOverviewForRun(analysisRunId: string): Promise<AnalysisOverview | null> {
  return getAnalysisOverview(analysisRunId);
}

export async function getAnalysisResultByRun(analysisRunId: string) {
  const [row] = await db
    .select()
    .from(analysisResultsTable)
    .where(eq(analysisResultsTable.analysisRunId, analysisRunId));
  return row ?? null;
}

export async function getAnalysisResultById(analysisResultId: string) {
  const [row] = await db.select().from(analysisResultsTable).where(eq(analysisResultsTable.id, analysisResultId));
  return row ?? null;
}

export async function listAnalysisRunsForDiagnostic(diagnosticId: string): Promise<AnalysisRun[]> {
  return db
    .select()
    .from(analysisRunsTable)
    .where(eq(analysisRunsTable.diagnosticId, diagnosticId))
    .orderBy(desc(analysisRunsTable.createdAt));
}
