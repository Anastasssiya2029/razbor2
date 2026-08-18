import { getDb } from "@/db";
import {
  analysisRuns,
  moneyNowSelections,
  p01AnalysisResults,
  p03PrescriptionResults,
} from "@/db/schema";
import { storedMoneyNowSelectionFromRow } from "@/server/money-now-selector/repository";
import type { P01ResultV1_4_1 } from "@/server/p01/types";
import { eq, sql } from "drizzle-orm";
import type { P03Repository, P03Source, StoredP03Result } from "./stage-types";
import type {
  BackendMetric,
  BackendRevenueScenario,
  P03Context,
  P03ResultV1_5,
  P03RuleVersions,
  P03SelectedScenarioProjection,
} from "./types";

function parseNullable<T>(value: string | null): T | null {
  return value === null ? null : JSON.parse(value) as T;
}

function safeJson(value: unknown): string | null {
  if (value == null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serializationError: "provider_raw_response_not_serializable" });
  }
}

export function storedP03ResultFromRow(
  row: typeof p03PrescriptionResults.$inferSelect,
): StoredP03Result {
  return {
    id: row.id,
    diagnosticId: row.diagnosticId,
    analysisRunId: row.analysisRunId,
    moneyNowSelectionId: row.moneyNowSelectionId,
    moneyNowSelectionHash: row.moneyNowSelectionHash,
    p01AnalysisResultId: row.p01AnalysisResultId,
    p01ResultHash: row.p01ResultHash,
    stageVersion: row.stageVersion as StoredP03Result["stageVersion"],
    promptVersion: row.promptVersion as StoredP03Result["promptVersion"],
    outputSchemaVersion: row.outputSchemaVersion as StoredP03Result["outputSchemaVersion"],
    ruleVersions: JSON.parse(row.ruleVersionsJson) as P03RuleVersions,
    contextHash: row.contextHash,
    inputHash: row.inputHash,
    deterministicInputHash: row.deterministicInputHash,
    context: parseNullable<P03Context>(row.contextJson),
    selectedScenario: parseNullable<P03SelectedScenarioProjection>(row.selectedScenarioJson),
    backendMetrics: JSON.parse(row.backendMetricsJson) as BackendMetric[],
    backendRevenueScenario: parseNullable<BackendRevenueScenario>(row.backendRevenueScenarioJson),
    lockedTeaserVersion: row.lockedTeaserVersion as StoredP03Result["lockedTeaserVersion"],
    lockedTeaser: row.lockedTeaser,
    result: parseNullable<P03ResultV1_5>(row.resultJson),
    skippedOutcome: parseNullable<StoredP03Result["skippedOutcome"]>(row.skippedOutcomeJson),
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

export function createD1P03Repository(): P03Repository {
  return {
    async loadSource(analysisRunId): Promise<P03Source | null> {
      const db = await getDb();
      const rows = await db.select({
        analysisRunId: analysisRuns.id,
        diagnosticId: analysisRuns.diagnosticId,
        runStatus: analysisRuns.status,
        p01Id: p01AnalysisResults.id,
        p01PromptVersion: p01AnalysisResults.promptVersion,
        p01OutputSchemaVersion: p01AnalysisResults.outputSchemaVersion,
        p01ResultJson: p01AnalysisResults.resultJson,
        p01FailureCode: p01AnalysisResults.failureCode,
      }).from(analysisRuns)
        .leftJoin(p01AnalysisResults, eq(p01AnalysisResults.analysisRunId, analysisRuns.id))
        .where(eq(analysisRuns.id, analysisRunId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const selectionRows = await db.select().from(moneyNowSelections)
        .where(eq(moneyNowSelections.analysisRunId, analysisRunId)).limit(1);
      return {
        analysisRunId: row.analysisRunId,
        diagnosticId: row.diagnosticId,
        runStatus: row.runStatus,
        p01: {
          id: row.p01Id,
          promptVersion: row.p01PromptVersion,
          outputSchemaVersion: row.p01OutputSchemaVersion,
          result: parseNullable<P01ResultV1_4_1>(row.p01ResultJson),
          failureCode: row.p01FailureCode,
        },
        moneyNowSelection: selectionRows[0]
          ? storedMoneyNowSelectionFromRow(selectionRows[0])
          : null,
      };
    },
    async loadResult(analysisRunId) {
      const db = await getDb();
      const rows = await db.select().from(p03PrescriptionResults)
        .where(eq(p03PrescriptionResults.analysisRunId, analysisRunId)).limit(1);
      return rows[0] ? storedP03ResultFromRow(rows[0]) : null;
    },
    async createResult(result) {
      const db = await getDb();
      const inserted = await db.insert(p03PrescriptionResults).values({
        id: result.id,
        diagnosticId: result.diagnosticId,
        analysisRunId: result.analysisRunId,
        moneyNowSelectionId: result.moneyNowSelectionId,
        moneyNowSelectionHash: result.moneyNowSelectionHash,
        p01AnalysisResultId: result.p01AnalysisResultId,
        p01ResultHash: result.p01ResultHash,
        stageVersion: result.stageVersion,
        promptVersion: result.promptVersion,
        outputSchemaVersion: result.outputSchemaVersion,
        ruleVersionsJson: JSON.stringify(result.ruleVersions),
        contextHash: result.contextHash,
        inputHash: result.inputHash,
        deterministicInputHash: result.deterministicInputHash,
        contextJson: safeJson(result.context),
        selectedScenarioJson: safeJson(result.selectedScenario),
        backendMetricsJson: JSON.stringify(result.backendMetrics),
        backendRevenueScenarioJson: safeJson(result.backendRevenueScenario),
        lockedTeaserVersion: result.lockedTeaserVersion,
        lockedTeaser: result.lockedTeaser,
        resultJson: safeJson(result.result),
        skippedOutcomeJson: safeJson(result.skippedOutcome),
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
      }).onConflictDoNothing({ target: p03PrescriptionResults.analysisRunId })
        .returning({ id: p03PrescriptionResults.id });
      return inserted.length === 1;
    },
    async updateRun(analysisRunId, update) {
      const db = await getDb();
      const rows = await db.select({
        promptVersionsJson: analysisRuns.promptVersionsJson,
        modelMetadataJson: analysisRuns.modelMetadataJson,
      }).from(analysisRuns).where(eq(analysisRuns.id, analysisRunId)).limit(1);
      const prompts = rows[0]?.promptVersionsJson
        ? JSON.parse(rows[0].promptVersionsJson) as Record<string, unknown>
        : {};
      const metadata = rows[0]?.modelMetadataJson
        ? JSON.parse(rows[0].modelMetadataJson) as Record<string, unknown>
        : {};
      await db.update(analysisRuns).set({
        status: update.status,
        errorCode: update.errorCode,
        errorMessage: update.errorMessage,
        promptVersionsJson: JSON.stringify({ ...prompts, P03: update.promptVersion }),
        modelMetadataJson: JSON.stringify({
          ...metadata,
          aiStages: {
            ...((metadata.aiStages as Record<string, unknown> | undefined) ?? {}),
            p03: update.metadata,
          },
        }),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }).where(eq(analysisRuns.id, analysisRunId));
    },
  };
}
