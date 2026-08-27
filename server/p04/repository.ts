import { getDb } from "@/db";
import {
  analysisRuns,
  diagnostics,
  moneyNowSelections,
  p01AnalysisResults,
  p02AnalysisResults,
  p03PrescriptionResults,
  p04ReportResults,
  resolvedTransitionPlans,
  targetArchetypeResults,
} from "@/db/schema";
import { validateDiagnosticInput } from "@/lib/diagnostic-input";
import type { BusinessArchetypeResult, TargetConfigurationInput, TargetConfigurationResult } from "@/server/7k";
import type { SevenKScores } from "@/server/7k/types";
import { storedMoneyNowSelectionFromRow } from "@/server/money-now-selector/repository";
import type { P01ResultV1_4_2 } from "@/server/p01/types";
import { storedP02ResultFromRow } from "@/server/p02/repository";
import { storedP03ResultFromRow } from "@/server/p03/repository";
import type { TargetArchetypeResourceVersions } from "@/server/stage4/types";
import type { ResolvedTransitionPlan, StoredResolvedTransitionPlan } from "@/server/task-resolver/types";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { P04Repository, P04Source, StoredP04Result } from "./stage-types";
import type {
  P04Context,
  P04ReportPolicy,
  P04ResultV1_2,
  P04RuleVersions,
  P04SourceRegistry,
  P04UpstreamHashes,
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

function storedTarget(
  row: typeof targetArchetypeResults.$inferSelect,
): NonNullable<P04Source["targetStage"]> {
  return {
    id: row.id,
    diagnosticId: row.diagnosticId,
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: row.p01AnalysisResultId,
    p01InputHash: row.p01InputHash,
    p01ResultHash: row.p01ResultHash,
    currentScores: parseNullable<SevenKScores>(row.currentScoresJson),
    targetInput: parseNullable<TargetConfigurationInput>(row.targetInputJson),
    target: parseNullable<TargetConfigurationResult>(row.targetResultJson),
    archetype: parseNullable<BusinessArchetypeResult>(row.archetypeResultJson),
    resourceVersions: JSON.parse(row.resourceVersionsJson) as TargetArchetypeResourceVersions,
    deterministicInputHash: row.deterministicInputHash,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
  };
}

function storedPlan(
  row: typeof resolvedTransitionPlans.$inferSelect,
): StoredResolvedTransitionPlan {
  return {
    id: row.id,
    diagnosticId: row.diagnosticId,
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: row.p01AnalysisResultId,
    targetArchetypeResultId: row.targetArchetypeResultId,
    p02AnalysisResultId: row.p02AnalysisResultId,
    p02ResultHash: row.p02ResultHash,
    targetResultHash: row.targetResultHash,
    stageVersion: row.stageVersion as StoredResolvedTransitionPlan["stageVersion"],
    transitionRegistryVersion: row.transitionRegistryVersion as StoredResolvedTransitionPlan["transitionRegistryVersion"],
    deterministicInputHash: row.deterministicInputHash,
    plan: parseNullable<ResolvedTransitionPlan>(row.planJson),
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
  };
}

export function storedP04ResultFromRow(
  row: typeof p04ReportResults.$inferSelect,
): StoredP04Result {
  return {
    id: row.id,
    diagnosticId: row.diagnosticId,
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: row.p01AnalysisResultId,
    targetArchetypeResultId: row.targetArchetypeResultId,
    p02AnalysisResultId: row.p02AnalysisResultId,
    resolvedTransitionPlanId: row.resolvedTransitionPlanId,
    moneyNowSelectionId: row.moneyNowSelectionId,
    p03PrescriptionResultId: row.p03PrescriptionResultId,
    upstreamHashes: JSON.parse(row.upstreamHashesJson) as P04UpstreamHashes,
    stageVersion: row.stageVersion as StoredP04Result["stageVersion"],
    promptVersion: row.promptVersion as StoredP04Result["promptVersion"],
    outputSchemaVersion: row.outputSchemaVersion as StoredP04Result["outputSchemaVersion"],
    promptSha256: row.promptSha256,
    ruleVersions: JSON.parse(row.ruleVersionsJson) as P04RuleVersions,
    context: JSON.parse(row.contextJson) as P04Context,
    contextHash: row.contextHash,
    reportPolicy: JSON.parse(row.reportPolicyJson) as P04ReportPolicy,
    sourceRegistry: JSON.parse(row.sourceRegistryJson) as P04SourceRegistry,
    sourceRegistryHash: row.sourceRegistryHash,
    reportGlossary: JSON.parse(row.reportGlossaryJson) as Record<string, unknown>,
    inputHash: row.inputHash,
    deterministicInputHash: row.deterministicInputHash,
    result: parseNullable<P04ResultV1_2>(row.resultJson),
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

export function createD1P04Repository(): P04Repository {
  return {
    async loadSource(analysisRunId): Promise<P04Source | null> {
      const db = await getDb();
      const runRows = await db.select({
        analysisRunId: analysisRuns.id,
        diagnosticId: analysisRuns.diagnosticId,
        runStatus: analysisRuns.status,
        normalizedInputJson: diagnostics.normalizedInputJson,
      }).from(analysisRuns)
        .innerJoin(diagnostics, eq(diagnostics.id, analysisRuns.diagnosticId))
        .where(eq(analysisRuns.id, analysisRunId))
        .limit(1);
      const run = runRows[0];
      if (!run) return null;
      const [p01Rows, targetRows, p02Rows, planRows, selectionRows, p03Rows] = await Promise.all([
        db.select().from(p01AnalysisResults).where(eq(p01AnalysisResults.analysisRunId, analysisRunId)).limit(1),
        db.select().from(targetArchetypeResults).where(eq(targetArchetypeResults.analysisRunId, analysisRunId)).limit(1),
        db.select().from(p02AnalysisResults).where(eq(p02AnalysisResults.analysisRunId, analysisRunId)).limit(1),
        db.select().from(resolvedTransitionPlans).where(eq(resolvedTransitionPlans.analysisRunId, analysisRunId)).limit(1),
        db.select().from(moneyNowSelections).where(eq(moneyNowSelections.analysisRunId, analysisRunId)).limit(1),
        db.select().from(p03PrescriptionResults).where(eq(p03PrescriptionResults.analysisRunId, analysisRunId)).limit(1),
      ]);
      const normalized = validateDiagnosticInput(JSON.parse(run.normalizedInputJson));
      const p01Row = p01Rows[0];
      return {
        analysisRunId: run.analysisRunId,
        diagnosticId: run.diagnosticId,
        runStatus: run.runStatus,
        clientContext: {
          expertName: normalized.identity.expertName,
          niche: normalized.identity.niche,
        },
        p01: {
          id: p01Row?.id ?? null,
          promptVersion: p01Row?.promptVersion ?? null,
          outputSchemaVersion: p01Row?.outputSchemaVersion ?? null,
          result: parseNullable<P01ResultV1_4_2>(p01Row?.resultJson ?? null),
          failureCode: p01Row?.failureCode ?? null,
        },
        targetStage: targetRows[0] ? storedTarget(targetRows[0]) : null,
        p02: p02Rows[0] ? storedP02ResultFromRow(p02Rows[0]) : null,
        resolvedPlan: planRows[0] ? storedPlan(planRows[0]) : null,
        moneyNowSelection: selectionRows[0]
          ? storedMoneyNowSelectionFromRow(selectionRows[0])
          : null,
        p03: p03Rows[0] ? storedP03ResultFromRow(p03Rows[0]) : null,
      };
    },

    async loadResult(analysisRunId) {
      const db = await getDb();
      const rows = await db.select().from(p04ReportResults)
        .where(eq(p04ReportResults.analysisRunId, analysisRunId)).limit(1);
      return rows[0] ? storedP04ResultFromRow(rows[0]) : null;
    },

    async createResult(result) {
      const db = await getDb();
      const inserted = await db.insert(p04ReportResults).values({
        id: result.id,
        diagnosticId: result.diagnosticId,
        analysisRunId: result.analysisRunId,
        p01AnalysisResultId: result.p01AnalysisResultId,
        targetArchetypeResultId: result.targetArchetypeResultId,
        p02AnalysisResultId: result.p02AnalysisResultId,
        resolvedTransitionPlanId: result.resolvedTransitionPlanId,
        moneyNowSelectionId: result.moneyNowSelectionId,
        p03PrescriptionResultId: result.p03PrescriptionResultId,
        upstreamHashesJson: JSON.stringify(result.upstreamHashes),
        stageVersion: result.stageVersion,
        promptVersion: result.promptVersion,
        outputSchemaVersion: result.outputSchemaVersion,
        promptSha256: result.promptSha256,
        ruleVersionsJson: JSON.stringify(result.ruleVersions),
        contextJson: JSON.stringify(result.context),
        contextHash: result.contextHash,
        reportPolicyJson: JSON.stringify(result.reportPolicy),
        sourceRegistryJson: JSON.stringify(result.sourceRegistry),
        sourceRegistryHash: result.sourceRegistryHash,
        reportGlossaryJson: JSON.stringify(result.reportGlossary),
        inputHash: result.inputHash,
        deterministicInputHash: result.deterministicInputHash,
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
      }).onConflictDoNothing({ target: p04ReportResults.analysisRunId })
        .returning({ id: p04ReportResults.id });
      return inserted.length === 1;
    },

    async replaceFailedResult(result) {
      const db = await getDb();
      const updated = await db.update(p04ReportResults).set({
        id: result.id,
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
      }).where(and(
        eq(p04ReportResults.analysisRunId, result.analysisRunId),
        eq(p04ReportResults.deterministicInputHash, result.deterministicInputHash),
        isNotNull(p04ReportResults.failureCode),
      )).returning({ id: p04ReportResults.id });
      return updated.length === 1;
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
        promptVersionsJson: JSON.stringify({ ...prompts, P04: update.promptVersion }),
        modelMetadataJson: JSON.stringify({
          ...metadata,
          aiStages: {
            ...((metadata.aiStages as Record<string, unknown> | undefined) ?? {}),
            p04: update.metadata,
          },
        }),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }).where(eq(analysisRuns.id, analysisRunId));
    },
  };
}
