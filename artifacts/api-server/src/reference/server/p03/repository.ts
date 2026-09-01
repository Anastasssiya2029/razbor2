import {
  analysisRunsTable as analysisRuns,
  db,
  moneyNowSelectionsTable as moneyNowSelections,
  p01AnalysisResultsTable as p01AnalysisResults,
  p03PrescriptionResultsTable as p03PrescriptionResults,
} from "@workspace/db";
import { storedMoneyNowSelectionFromRow } from "@/server/money-now-selector/repository";
import type { P01ResultV1_4_2 } from "@/server/p01/types";
import { eq } from "drizzle-orm";
import type { P03Repository, P03Source, StoredP03Result } from "./stage-types";
import type {
  BackendMetric,
  BackendRevenueScenario,
  P03Context,
  P03ResultV1_5,
  P03RuleVersions,
  P03SelectedScenarioProjection,
} from "./types";

type P03Persistence = Omit<StoredP03Result, "id" | "analysisRunId">;

export function storedP03ResultFromRow(
  row: typeof p03PrescriptionResults.$inferSelect,
): StoredP03Result {
  const persistence = row.result as unknown as P03Persistence | null;
  if (!persistence) throw new Error("Persisted P-03 result metadata is missing.");
  const {
    diagnosticId: _diagnosticId,
    moneyNowSelectionId: _moneyNowSelectionId,
    ...stored
  } = persistence;
  return {
    id: row.id,
    diagnosticId: _diagnosticId,
    analysisRunId: row.analysisRunId,
    moneyNowSelectionId: row.moneyNowSelectionId,
    ...stored,
  };
}

export function createD1P03Repository(): P03Repository {
  return {
    async loadSource(analysisRunId): Promise<P03Source | null> {
      const rows = await db.select({
        analysisRunId: analysisRuns.id,
        diagnosticId: analysisRuns.diagnosticId,
        runStatus: analysisRuns.status,
        p01Id: p01AnalysisResults.id,
        p01PromptVersion: p01AnalysisResults.promptVersion,
        p01OutputSchemaVersion: p01AnalysisResults.outputSchemaVersion,
        p01Result: p01AnalysisResults.result,
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
          result: row.p01Result as P01ResultV1_4_2 | null,
          failureCode: row.p01FailureCode,
        },
        moneyNowSelection: selectionRows[0]
          ? storedMoneyNowSelectionFromRow(selectionRows[0])
          : null,
      };
    },
    async loadResult(analysisRunId) {
      const rows = await db.select().from(p03PrescriptionResults)
        .where(eq(p03PrescriptionResults.analysisRunId, analysisRunId)).limit(1);
      return rows[0] ? storedP03ResultFromRow(rows[0]) : null;
    },
    async createResult(result) {
      const inserted = await db.insert(p03PrescriptionResults).values({
        analysisRunId: result.analysisRunId,
        moneyNowSelectionId: result.moneyNowSelectionId,
        status: result.skippedOutcome ? "skipped_no_scenario" : "prescribed",
        promptVersion: result.promptVersion,
        outputSchemaVersion: result.outputSchemaVersion,
        inputHash: result.inputHash,
        resultHash: null,
        result: {
          diagnosticId: result.diagnosticId,
          moneyNowSelectionHash: result.moneyNowSelectionHash,
          p01AnalysisResultId: result.p01AnalysisResultId,
          p01ResultHash: result.p01ResultHash,
          stageVersion: result.stageVersion,
          promptVersion: result.promptVersion,
          outputSchemaVersion: result.outputSchemaVersion,
          ruleVersions: result.ruleVersions,
          contextHash: result.contextHash,
          inputHash: result.inputHash,
          deterministicInputHash: result.deterministicInputHash,
          context: result.context,
          selectedScenario: result.selectedScenario,
          backendMetrics: result.backendMetrics,
          backendRevenueScenario: result.backendRevenueScenario,
          lockedTeaserVersion: result.lockedTeaserVersion,
          lockedTeaser: result.lockedTeaser,
          result: result.result,
          skippedOutcome: result.skippedOutcome,
          providerRawResponse: result.providerRawResponse,
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
        },
        providerRawResponse: { value: result.providerRawResponse },
        providerModel: result.model,
        tokenUsage: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          totalTokens: result.totalTokens,
          costUsd: result.costUsd,
        },
        retryCount: result.retryCount,
        failureCode: result.failureCode,
        failureMessage: result.failureMessage,
        startedAt: new Date(result.startedAt),
        completedAt: new Date(result.finishedAt),
      }).onConflictDoNothing({ target: p03PrescriptionResults.analysisRunId })
        .returning({ id: p03PrescriptionResults.id });
      return inserted.length === 1;
    },
    async updateRun(analysisRunId, update) {
      const rows = await db.select({
        metadata: analysisRuns.metadata,
      }).from(analysisRuns).where(eq(analysisRuns.id, analysisRunId)).limit(1);
      const metadata = rows[0]?.metadata ?? {};
      await db.update(analysisRuns).set({
        status: update.status,
        errorCode: update.errorCode,
        errorMessage: update.errorMessage,
        metadata: {
          ...metadata,
          promptVersions: {
            ...((metadata.promptVersions as Record<string, unknown> | undefined) ?? {}),
            P03: update.promptVersion,
          },
          ...metadata,
          aiStages: {
            ...((metadata.aiStages as Record<string, unknown> | undefined) ?? {}),
            p03: update.metadata,
          },
        },
      }).where(eq(analysisRuns.id, analysisRunId));
    },
  };
}
