import { getDb } from "@/db";
import { analysisRuns, p01AnalysisResults, p02AnalysisResults, targetArchetypeResults } from "@/db/schema";
import type { TargetConfigurationResult } from "@/server/7k";
import type { SevenKScores } from "@/server/7k/types";
import type { P01ResultV1_4_1 } from "@/server/p01/types";
import type { TargetArchetypeResourceVersions } from "@/server/stage4/types";
import { eq, sql } from "drizzle-orm";
import type { P02UpstreamSource } from "./projections";
import type { P02Repository, StoredP02Result } from "./stage-types";
import type { P01StrategyContext, P02ResultV1_3, P02RuleVersions, TargetConfigProjection } from "./types";

function parseNullable<T>(value: string | null): T | null {
  return value === null ? null : JSON.parse(value) as T;
}

function safeJson(value: unknown): string | null {
  if (value == null) return null;
  try { return JSON.stringify(value); }
  catch { return JSON.stringify({ serializationError: "provider_raw_response_not_serializable" }); }
}

type P02TargetRow = {
  id: string;
  diagnosticId: string;
  analysisRunId: string;
  p01AnalysisResultId: string | null;
  p01InputHash: string | null;
  p01ResultHash: string | null;
  currentScoresJson: string | null;
  targetResultJson: string | null;
  resourceVersionsJson: string;
  deterministicInputHash: string;
  failureCode: string | null;
  failureMessage: string | null;
};

function stage4FromRow(row: P02TargetRow | null): P02UpstreamSource["targetStage"] {
  if (!row) return null;
  return {
    id: row.id,
    diagnosticId: row.diagnosticId,
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: row.p01AnalysisResultId,
    p01InputHash: row.p01InputHash,
    p01ResultHash: row.p01ResultHash,
    currentScores: parseNullable<SevenKScores>(row.currentScoresJson),
    target: parseNullable<TargetConfigurationResult>(row.targetResultJson),
    resourceVersions: JSON.parse(row.resourceVersionsJson) as TargetArchetypeResourceVersions,
    deterministicInputHash: row.deterministicInputHash,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
  };
}

export function storedP02ResultFromRow(row: typeof p02AnalysisResults.$inferSelect): StoredP02Result {
  return {
    id: row.id,
    diagnosticId: row.diagnosticId,
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: row.p01AnalysisResultId,
    targetArchetypeResultId: row.targetArchetypeResultId,
    p01ResultHash: row.p01ResultHash,
    targetResultHash: row.targetResultHash,
    promptVersion: row.promptVersion as "P-02.v1.3",
    outputSchemaVersion: row.outputSchemaVersion as "1.3",
    ruleVersions: JSON.parse(row.ruleVersionsJson) as P02RuleVersions,
    inputHash: row.inputHash,
    strategyContext: JSON.parse(row.strategyContextJson) as P01StrategyContext,
    targetConfig: JSON.parse(row.targetConfigJson) as TargetConfigProjection,
    result: parseNullable<P02ResultV1_3>(row.resultJson),
    providerRawResponse: parseNullable<unknown>(row.providerRawResponseJson),
    provider: row.provider,
    model: row.model,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    latencyMs: row.latencyMs,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    totalTokens: row.totalTokens,
    costUsd: row.costUsd,
    retryCount: row.retryCount,
    technicalRetryCount: row.technicalRetryCount,
    reevaluationRetryCount: row.reevaluationRetryCount,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
  };
}

export function createD1P02Repository(): P02Repository {
  return {
    async loadSource(analysisRunId): Promise<P02UpstreamSource | null> {
      const db = await getDb();
      const rows = await db.select({
        analysisRunId: analysisRuns.id,
        diagnosticId: analysisRuns.diagnosticId,
        runStatus: analysisRuns.status,
        p01AnalysisResultId: p01AnalysisResults.id,
        p01PromptVersion: p01AnalysisResults.promptVersion,
        p01OutputSchemaVersion: p01AnalysisResults.outputSchemaVersion,
        p01InputHash: p01AnalysisResults.inputHash,
        p01ResultJson: p01AnalysisResults.resultJson,
        p01FailureCode: p01AnalysisResults.failureCode,
        target: {
          id: targetArchetypeResults.id,
          diagnosticId: targetArchetypeResults.diagnosticId,
          analysisRunId: targetArchetypeResults.analysisRunId,
          p01AnalysisResultId: targetArchetypeResults.p01AnalysisResultId,
          p01InputHash: targetArchetypeResults.p01InputHash,
          p01ResultHash: targetArchetypeResults.p01ResultHash,
          currentScoresJson: targetArchetypeResults.currentScoresJson,
          targetResultJson: targetArchetypeResults.targetResultJson,
          resourceVersionsJson: targetArchetypeResults.resourceVersionsJson,
          deterministicInputHash: targetArchetypeResults.deterministicInputHash,
          failureCode: targetArchetypeResults.failureCode,
          failureMessage: targetArchetypeResults.failureMessage,
        },
      }).from(analysisRuns)
        .leftJoin(p01AnalysisResults, eq(p01AnalysisResults.analysisRunId, analysisRuns.id))
        .leftJoin(targetArchetypeResults, eq(targetArchetypeResults.analysisRunId, analysisRuns.id))
        .where(eq(analysisRuns.id, analysisRunId)).limit(1);
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
        p01Result: parseNullable<P01ResultV1_4_1>(row.p01ResultJson),
        p01FailureCode: row.p01FailureCode,
        targetStage: stage4FromRow(row.target),
      };
    },
    async loadResult(analysisRunId) {
      const db = await getDb();
      const rows = await db.select().from(p02AnalysisResults).where(eq(p02AnalysisResults.analysisRunId, analysisRunId)).limit(1);
      return rows[0] ? storedP02ResultFromRow(rows[0]) : null;
    },
    async createResult(result) {
      const db = await getDb();
      const inserted = await db.insert(p02AnalysisResults).values({
        id: result.id,
        diagnosticId: result.diagnosticId,
        analysisRunId: result.analysisRunId,
        p01AnalysisResultId: result.p01AnalysisResultId,
        targetArchetypeResultId: result.targetArchetypeResultId,
        p01ResultHash: result.p01ResultHash,
        targetResultHash: result.targetResultHash,
        promptVersion: result.promptVersion,
        outputSchemaVersion: result.outputSchemaVersion,
        ruleVersionsJson: JSON.stringify(result.ruleVersions),
        inputHash: result.inputHash,
        strategyContextJson: JSON.stringify(result.strategyContext),
        targetConfigJson: JSON.stringify(result.targetConfig),
        resultJson: safeJson(result.result),
        providerRawResponseJson: safeJson(result.providerRawResponse),
        provider: result.provider,
        model: result.model,
        startedAt: result.startedAt,
        finishedAt: result.finishedAt,
        latencyMs: result.latencyMs,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: result.totalTokens,
        costUsd: result.costUsd,
        retryCount: result.retryCount,
        technicalRetryCount: result.technicalRetryCount,
        reevaluationRetryCount: result.reevaluationRetryCount,
        failureCode: result.failureCode,
        failureMessage: result.failureMessage,
      }).onConflictDoNothing({ target: p02AnalysisResults.analysisRunId }).returning({ id: p02AnalysisResults.id });
      return inserted.length === 1;
    },
    async updateRun(analysisRunId, update) {
      const db = await getDb();
      const rows = await db.select({ promptVersionsJson: analysisRuns.promptVersionsJson, modelMetadataJson: analysisRuns.modelMetadataJson })
        .from(analysisRuns).where(eq(analysisRuns.id, analysisRunId)).limit(1);
      const prompts = rows[0]?.promptVersionsJson ? JSON.parse(rows[0].promptVersionsJson) as Record<string, unknown> : {};
      const models = rows[0]?.modelMetadataJson ? JSON.parse(rows[0].modelMetadataJson) as Record<string, unknown> : {};
      await db.update(analysisRuns).set({
        status: update.status,
        errorCode: update.errorCode,
        errorMessage: update.errorMessage,
        promptVersionsJson: JSON.stringify({ ...prompts, P02: update.promptVersion }),
        modelMetadataJson: JSON.stringify({ ...models, aiStages: { ...((models.aiStages as Record<string, unknown> | undefined) ?? {}), p02: update.metadata } }),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }).where(eq(analysisRuns.id, analysisRunId));
    },
  };
}
