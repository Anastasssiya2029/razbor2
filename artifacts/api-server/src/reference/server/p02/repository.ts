import { db, analysisRunsTable, p01AnalysisResultsTable, p02AnalysisResultsTable, targetArchetypeResultsTable } from "@workspace/db";
import type { TargetConfigurationResult } from "@/server/7k";
import type { SevenKScores } from "@/server/7k/types";
import type { P01ResultV1_4_2 } from "@/server/p01/types";
import type { TargetArchetypeResourceVersions } from "@/server/stage4/types";
import { and, eq, isNotNull } from "drizzle-orm";
import type { P02UpstreamSource } from "./projections";
import type { P02Repository, StoredP02Result } from "./stage-types";
import type { P01StrategyContext, P02ResultV1_3, P02RuleVersions, TargetConfigProjection } from "./types";

type P02Persistence = {
  diagnosticId: string;
  p01AnalysisResultId: string;
  p01ResultHash: string;
  ruleVersions: P02RuleVersions;
  strategyContext: P01StrategyContext;
  targetConfig: TargetConfigProjection;
  provider: string;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  technicalRetryCount: number;
  reevaluationRetryCount: number;
};

function persistenceFor(result: StoredP02Result): P02Persistence {
  return {
    diagnosticId: result.diagnosticId,
    p01AnalysisResultId: result.p01AnalysisResultId,
    p01ResultHash: result.p01ResultHash,
    ruleVersions: result.ruleVersions,
    strategyContext: result.strategyContext,
    targetConfig: result.targetConfig,
    provider: result.provider,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    latencyMs: result.latencyMs,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    totalTokens: result.totalTokens,
    costUsd: result.costUsd,
    technicalRetryCount: result.technicalRetryCount,
    reevaluationRetryCount: result.reevaluationRetryCount,
  };
}

function asDate(value: string): Date {
  return new Date(value);
}

function stage4FromRow(row: {
  id: string;
  analysisRunId: string;
  p01AnalysisResultId: string;
  p01ResultHash: string;
  currentScores: Record<string, number> | null;
  // Stored as `{ result: TargetConfigurationResult, targetInput }` -- see
  // stage4/repository.ts's `createResult` -- not the bare result itself.
  target: { result?: TargetConfigurationResult | null } | null;
  resourceVersions: Record<string, string>;
  deterministicInputHash: string;
  failureCode: string | null;
  failureMessage: string | null;
} | null, diagnosticId: string, p01InputHash: string | null): P02UpstreamSource["targetStage"] {
  if (!row) return null;
  return {
    id: row.id,
    diagnosticId,
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: row.p01AnalysisResultId,
    p01InputHash,
    p01ResultHash: row.p01ResultHash,
    currentScores: row.currentScores as SevenKScores | null,
    target: (row.target?.result ?? null) as TargetConfigurationResult | null,
    resourceVersions: row.resourceVersions as TargetArchetypeResourceVersions,
    deterministicInputHash: row.deterministicInputHash,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
  };
}

export function storedP02ResultFromRow(row: typeof p02AnalysisResultsTable.$inferSelect): StoredP02Result {
  const metadata = row.tokenUsage as unknown as P02Persistence;
  if (!metadata) throw new Error(`P-02 result ${row.id} is missing compact persistence metadata.`);
  return {
    id: row.id,
    diagnosticId: metadata.diagnosticId,
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: metadata.p01AnalysisResultId,
    targetArchetypeResultId: row.targetArchetypeResultId,
    p01ResultHash: metadata.p01ResultHash,
    targetResultHash: row.targetResultHash,
    promptVersion: row.promptVersion as "P-02.v1.3",
    outputSchemaVersion: row.outputSchemaVersion as "1.3",
    ruleVersions: metadata.ruleVersions,
    inputHash: row.inputHash,
    strategyContext: metadata.strategyContext,
    targetConfig: metadata.targetConfig,
    result: row.result as P02ResultV1_3 | null,
    providerRawResponse: row.providerRawResponse,
    provider: metadata.provider,
    model: row.providerModel ?? "",
    startedAt: metadata.startedAt,
    finishedAt: metadata.finishedAt,
    latencyMs: metadata.latencyMs,
    inputTokens: metadata.inputTokens,
    outputTokens: metadata.outputTokens,
    totalTokens: metadata.totalTokens,
    costUsd: metadata.costUsd,
    retryCount: row.retryCount,
    technicalRetryCount: metadata.technicalRetryCount,
    reevaluationRetryCount: metadata.reevaluationRetryCount,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
  };
}

function valuesFor(result: StoredP02Result) {
  return {
    analysisRunId: result.analysisRunId,
    targetArchetypeResultId: result.targetArchetypeResultId,
    targetResultHash: result.targetResultHash,
    promptVersion: result.promptVersion,
    outputSchemaVersion: result.outputSchemaVersion,
    inputHash: result.inputHash,
    result: result.result as Record<string, unknown> | null,
    providerRawResponse: result.providerRawResponse as Record<string, unknown> | null,
    providerModel: result.model,
    tokenUsage: persistenceFor(result) as unknown as Record<string, unknown>,
    retryCount: result.retryCount,
    failureCode: result.failureCode,
    failureMessage: result.failureMessage,
    startedAt: asDate(result.startedAt),
    completedAt: asDate(result.finishedAt),
  };
}

export function createD1P02Repository(): P02Repository {
  return {
    async loadSource(analysisRunId): Promise<P02UpstreamSource | null> {
      const rows = await db.select({
        analysisRunId: analysisRunsTable.id,
        diagnosticId: analysisRunsTable.diagnosticId,
        runStatus: analysisRunsTable.status,
        p01AnalysisResultId: p01AnalysisResultsTable.id,
        p01PromptVersion: p01AnalysisResultsTable.promptVersion,
        p01OutputSchemaVersion: p01AnalysisResultsTable.outputSchemaVersion,
        p01InputHash: p01AnalysisResultsTable.inputHash,
        p01Result: p01AnalysisResultsTable.result,
        p01FailureCode: p01AnalysisResultsTable.failureCode,
        target: targetArchetypeResultsTable,
      }).from(analysisRunsTable)
        .leftJoin(p01AnalysisResultsTable, eq(p01AnalysisResultsTable.analysisRunId, analysisRunsTable.id))
        .leftJoin(targetArchetypeResultsTable, eq(targetArchetypeResultsTable.analysisRunId, analysisRunsTable.id))
        .where(eq(analysisRunsTable.id, analysisRunId)).limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        analysisRunId: row.analysisRunId,
        diagnosticId: row.diagnosticId,
        runStatus: row.runStatus,
        p01AnalysisResultId: row.p01AnalysisResultId,
        p01PromptVersion: row.p01PromptVersion,
        p01OutputSchemaVersion: row.p01OutputSchemaVersion,
        p01InputHash: row.p01InputHash,
        p01Result: row.p01Result as P01ResultV1_4_2 | null,
        p01FailureCode: row.p01FailureCode,
        targetStage: stage4FromRow(row.target, row.diagnosticId, row.p01InputHash),
      };
    },
    async loadResult(analysisRunId) {
      const rows = await db.select().from(p02AnalysisResultsTable).where(eq(p02AnalysisResultsTable.analysisRunId, analysisRunId)).limit(1);
      return rows[0] ? storedP02ResultFromRow(rows[0]) : null;
    },
    async createResult(result) {
      const inserted = await db.insert(p02AnalysisResultsTable).values(valuesFor(result))
        .onConflictDoNothing({ target: p02AnalysisResultsTable.analysisRunId }).returning({ id: p02AnalysisResultsTable.id });
      return inserted.length === 1;
    },
    async replaceFailedResult(result) {
      const updated = await db.update(p02AnalysisResultsTable).set(valuesFor(result)).where(and(
        eq(p02AnalysisResultsTable.analysisRunId, result.analysisRunId),
        eq(p02AnalysisResultsTable.inputHash, result.inputHash),
        isNotNull(p02AnalysisResultsTable.failureCode),
      )).returning({ id: p02AnalysisResultsTable.id });
      return updated.length === 1;
    },
    async updateRun(analysisRunId, update) {
      const rows = await db.select({ metadata: analysisRunsTable.metadata })
        .from(analysisRunsTable).where(eq(analysisRunsTable.id, analysisRunId)).limit(1);
      const metadata = rows[0]?.metadata ?? {};
      await db.update(analysisRunsTable).set({
        status: update.status,
        errorCode: update.errorCode,
        errorMessage: update.errorMessage,
        metadata: {
          ...metadata,
          promptVersions: { ...((metadata.promptVersions as Record<string, unknown> | undefined) ?? {}), P02: update.promptVersion },
          aiStages: { ...((metadata.aiStages as Record<string, unknown> | undefined) ?? {}), p02: update.metadata },
        },
      }).where(eq(analysisRunsTable.id, analysisRunId));
    },
  };
}