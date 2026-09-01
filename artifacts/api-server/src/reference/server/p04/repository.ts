import {
  analysisRunsTable as analysisRuns,
  db,
  diagnosticsTable as diagnostics,
  moneyNowSelectionsTable as moneyNowSelections,
  p01AnalysisResultsTable as p01AnalysisResults,
  p02AnalysisResultsTable as p02AnalysisResults,
  p03PrescriptionResultsTable as p03PrescriptionResults,
  p04ReportResultsTable as p04ReportResults,
  resolvedTransitionPlansTable as resolvedTransitionPlans,
  targetArchetypeResultsTable as targetArchetypeResults,
} from "@workspace/db";
import { validateDiagnosticInput } from "@/lib/diagnostic-input";
import type { BusinessArchetypeResult, TargetConfigurationInput, TargetConfigurationResult } from "@/server/7k";
import type { SevenKScores } from "@/server/7k/types";
import { storedMoneyNowSelectionFromRow } from "@/server/money-now-selector/repository";
import type { P01ResultV1_4_2 } from "@/server/p01/types";
import { storedP02ResultFromRow } from "@/server/p02/repository";
import { storedP03ResultFromRow } from "@/server/p03/repository";
import type { TargetArchetypeResourceVersions } from "@/server/stage4/types";
import type { ResolvedTransitionPlan, StoredResolvedTransitionPlan } from "@/server/task-resolver/types";
import { and, eq, isNotNull } from "drizzle-orm";
import type { P04Repository, P04Source, StoredP04Result } from "./stage-types";
import type {
  P04Context,
  P04ReportPolicy,
  P04ResultV1_2,
  P04RuleVersions,
  P04SourceRegistry,
  P04UpstreamHashes,
} from "./types";

function storedTarget(
  row: typeof targetArchetypeResults.$inferSelect,
): NonNullable<P04Source["targetStage"]> {
  // `target` column stores `{ result: TargetConfigurationResult, targetInput }`
  // and `archetype` stores `{ result: BusinessArchetypeResult, diagnosticId,
  // p01InputHash, startedAt, completedAt }` -- see stage4/repository.ts's
  // `createResult`. Unwrap both instead of casting the wrapper objects
  // directly to their inner shapes.
  const targetSnapshot = row.target as { result?: TargetConfigurationResult | null; targetInput?: TargetConfigurationInput | null } | null;
  const archetypeSnapshot = row.archetype as
    | { result?: BusinessArchetypeResult | null; diagnosticId?: string; p01InputHash?: string | null; startedAt?: string; completedAt?: string }
    | null;
  return {
    id: row.id,
    diagnosticId: archetypeSnapshot?.diagnosticId ?? "",
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: row.p01AnalysisResultId,
    p01InputHash: archetypeSnapshot?.p01InputHash ?? null,
    p01ResultHash: row.p01ResultHash,
    currentScores: row.currentScores as SevenKScores | null,
    targetInput: targetSnapshot?.targetInput ?? null,
    target: targetSnapshot?.result ?? null,
    archetype: archetypeSnapshot?.result ?? null,
    resourceVersions: row.resourceVersions as TargetArchetypeResourceVersions,
    deterministicInputHash: row.deterministicInputHash,
    startedAt: archetypeSnapshot?.startedAt ?? row.createdAt.toISOString(),
    completedAt: archetypeSnapshot?.completedAt ?? row.createdAt.toISOString(),
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
  };
}

function storedPlan(
  row: typeof resolvedTransitionPlans.$inferSelect,
): StoredResolvedTransitionPlan {
  // `plan` column stores `{ plan: ResolvedTransitionPlan, referenceMetadata }`
  // -- see task-resolver/repository.ts's `stored()`, which is the canonical
  // unwrap for this same envelope -- not a flat object with these fields at
  // the top level.
  const envelope = row.plan as { plan?: ResolvedTransitionPlan | null; referenceMetadata?: Record<string, unknown> } | null;
  const metadata = envelope?.referenceMetadata;
  return {
    id: row.id,
    diagnosticId: metadata?.diagnosticId as string,
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: metadata?.p01AnalysisResultId as string,
    targetArchetypeResultId: metadata?.targetArchetypeResultId as string,
    p02AnalysisResultId: row.p02AnalysisResultId,
    p02ResultHash: row.p02ResultHash,
    targetResultHash: metadata?.targetResultHash as string,
    stageVersion: metadata?.stageVersion as StoredResolvedTransitionPlan["stageVersion"],
    transitionRegistryVersion: row.transitionRegistryVersion as StoredResolvedTransitionPlan["transitionRegistryVersion"],
    deterministicInputHash: row.deterministicInputHash,
    plan: envelope?.plan ?? null,
    startedAt: (metadata?.startedAt as string | undefined) ?? row.createdAt.toISOString(),
    completedAt: (metadata?.completedAt as string | undefined) ?? row.createdAt.toISOString(),
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
  };
}

export function storedP04ResultFromRow(
  row: typeof p04ReportResults.$inferSelect,
): StoredP04Result {
  const envelope = row.providerRawResponse as {
    rawResponse?: unknown;
    referenceMetadata?: Omit<StoredP04Result, "id" | "analysisRunId" | "result" | "providerRawResponse" | "failureCode" | "failureMessage">;
  } | null;
  const metadata = envelope?.referenceMetadata;
  if (!metadata) {
    throw new Error("P-04 result is missing compact-schema reference metadata");
  }
  const usage = row.tokenUsage as Record<string, number | null> | null;
  return {
    id: row.id,
    diagnosticId: metadata.diagnosticId,
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: metadata.p01AnalysisResultId,
    targetArchetypeResultId: metadata.targetArchetypeResultId,
    p02AnalysisResultId: metadata.p02AnalysisResultId,
    resolvedTransitionPlanId: metadata.resolvedTransitionPlanId,
    moneyNowSelectionId: metadata.moneyNowSelectionId,
    p03PrescriptionResultId: row.p03PrescriptionResultId,
    upstreamHashes: metadata.upstreamHashes,
    stageVersion: metadata.stageVersion,
    promptVersion: row.promptVersion as StoredP04Result["promptVersion"],
    outputSchemaVersion: row.outputSchemaVersion as StoredP04Result["outputSchemaVersion"],
    promptSha256: metadata.promptSha256,
    ruleVersions: metadata.ruleVersions,
    context: metadata.context,
    contextHash: metadata.contextHash,
    reportPolicy: metadata.reportPolicy,
    sourceRegistry: metadata.sourceRegistry,
    sourceRegistryHash: metadata.sourceRegistryHash,
    reportGlossary: metadata.reportGlossary,
    inputHash: row.inputHash,
    deterministicInputHash: metadata.deterministicInputHash,
    result: row.result as P04ResultV1_2 | null,
    providerRawResponse: envelope?.rawResponse,
    provider: metadata.provider,
    model: row.providerModel ?? metadata.model,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.completedAt?.toISOString() ?? metadata.finishedAt,
    latencyMs: metadata.latencyMs,
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    costUsd: usage?.costUsd ?? null,
    retryCount: row.retryCount,
    technicalRetryCount: metadata.technicalRetryCount,
    reevaluationRetryCount: metadata.reevaluationRetryCount,
    attemptDiagnostics: metadata.attemptDiagnostics,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
  };
}

export function createD1P04Repository(): P04Repository {
  return {
    async loadSource(analysisRunId): Promise<P04Source | null> {
      const runRows = await db.select({
        analysisRunId: analysisRuns.id,
        diagnosticId: analysisRuns.diagnosticId,
        runStatus: analysisRuns.status,
        normalizedInput: diagnostics.normalizedInput,
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
      const normalized = validateDiagnosticInput(run.normalizedInput);
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
          result: (p01Row?.result as P01ResultV1_4_2 | null | undefined) ?? null,
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
      const rows = await db.select().from(p04ReportResults)
        .where(eq(p04ReportResults.analysisRunId, analysisRunId)).limit(1);
      return rows[0] ? storedP04ResultFromRow(rows[0]) : null;
    },

    async createResult(result) {
      const referenceMetadata = {
        diagnosticId: result.diagnosticId,
        p01AnalysisResultId: result.p01AnalysisResultId,
        targetArchetypeResultId: result.targetArchetypeResultId,
        p02AnalysisResultId: result.p02AnalysisResultId,
        resolvedTransitionPlanId: result.resolvedTransitionPlanId,
        moneyNowSelectionId: result.moneyNowSelectionId,
        upstreamHashes: result.upstreamHashes,
        stageVersion: result.stageVersion,
        promptSha256: result.promptSha256,
        ruleVersions: result.ruleVersions,
        context: result.context,
        contextHash: result.contextHash,
        reportPolicy: result.reportPolicy,
        sourceRegistry: result.sourceRegistry,
        sourceRegistryHash: result.sourceRegistryHash,
        reportGlossary: result.reportGlossary,
        deterministicInputHash: result.deterministicInputHash,
        provider: result.provider,
        model: result.model,
        finishedAt: result.finishedAt,
        latencyMs: result.latencyMs,
        technicalRetryCount: result.technicalRetryCount,
        reevaluationRetryCount: result.reevaluationRetryCount,
        attemptDiagnostics: result.attemptDiagnostics,
      };
      const inserted = await db.insert(p04ReportResults).values({
        analysisRunId: result.analysisRunId,
        p03PrescriptionResultId: result.p03PrescriptionResultId,
        promptVersion: result.promptVersion,
        outputSchemaVersion: result.outputSchemaVersion,
        inputHash: result.inputHash,
        resultHash: result.inputHash,
        result: result.result as Record<string, unknown> | null,
        providerRawResponse: { rawResponse: result.providerRawResponse, referenceMetadata },
        providerModel: result.model,
        tokenUsage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, totalTokens: result.totalTokens, costUsd: result.costUsd },
        startedAt: new Date(result.startedAt),
        completedAt: new Date(result.finishedAt),
        retryCount: result.retryCount,
        failureCode: result.failureCode,
        failureMessage: result.failureMessage,
      }).onConflictDoNothing({ target: p04ReportResults.analysisRunId })
        .returning({ id: p04ReportResults.id });
      return inserted.length === 1;
    },

    async replaceFailedResult(result) {
      const referenceMetadata = {
        diagnosticId: result.diagnosticId, p01AnalysisResultId: result.p01AnalysisResultId,
        targetArchetypeResultId: result.targetArchetypeResultId, p02AnalysisResultId: result.p02AnalysisResultId,
        resolvedTransitionPlanId: result.resolvedTransitionPlanId, moneyNowSelectionId: result.moneyNowSelectionId,
        upstreamHashes: result.upstreamHashes, stageVersion: result.stageVersion, promptSha256: result.promptSha256,
        ruleVersions: result.ruleVersions, context: result.context, contextHash: result.contextHash,
        reportPolicy: result.reportPolicy, sourceRegistry: result.sourceRegistry, sourceRegistryHash: result.sourceRegistryHash,
        reportGlossary: result.reportGlossary, deterministicInputHash: result.deterministicInputHash,
        provider: result.provider, model: result.model, finishedAt: result.finishedAt, latencyMs: result.latencyMs,
        technicalRetryCount: result.technicalRetryCount, reevaluationRetryCount: result.reevaluationRetryCount,
        attemptDiagnostics: result.attemptDiagnostics,
      };
      const updated = await db.update(p04ReportResults).set({
        result: result.result as Record<string, unknown> | null,
        providerRawResponse: { rawResponse: result.providerRawResponse, referenceMetadata },
        providerModel: result.model,
        tokenUsage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens, totalTokens: result.totalTokens, costUsd: result.costUsd },
        startedAt: new Date(result.startedAt),
        completedAt: new Date(result.finishedAt),
        retryCount: result.retryCount,
        failureCode: result.failureCode,
        failureMessage: result.failureMessage,
      }).where(and(
        eq(p04ReportResults.analysisRunId, result.analysisRunId),
        isNotNull(p04ReportResults.failureCode),
      )).returning({ id: p04ReportResults.id });
      return updated.length === 1;
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
          promptVersions: { ...((metadata.promptVersions as Record<string, unknown> | undefined) ?? {}), P04: update.promptVersion },
          aiStages: {
            ...((metadata.aiStages as Record<string, unknown> | undefined) ?? {}),
            p04: update.metadata,
          },
        },
      }).where(eq(analysisRuns.id, analysisRunId));
    },
  };
}
