import { getDb } from "@/db";
import {
  analysisRuns,
  moneyNowSelections,
  p01AnalysisResults,
  resolvedTransitionPlans,
} from "@/db/schema";
import type { P01ResultV1_4_1 } from "@/server/p01/types";
import type { ResolvedTransitionPlan } from "@/server/task-resolver/types";
import { eq, sql } from "drizzle-orm";
import type {
  MoneyNowSelectionSnapshot,
  MoneyNowSelectorFailure,
  MoneyNowSelectorInputV1_1,
  MoneyNowSelectorRepository,
  MoneyNowSelectorSource,
  StoredMoneyNowSelection,
} from "./types";

function parseNullable<T>(value: string | null): T | null {
  return value === null ? null : JSON.parse(value) as T;
}

function stored(row: typeof moneyNowSelections.$inferSelect): StoredMoneyNowSelection {
  const snapshot = parseNullable<MoneyNowSelectionSnapshot>(row.selectionJson);
  if (snapshot && row.candidateTraceJson) {
    const separatelyStoredTrace = parseNullable<MoneyNowSelectionSnapshot["candidateTrace"]>(
      row.candidateTraceJson,
    );
    if (JSON.stringify(separatelyStoredTrace) !== JSON.stringify(snapshot.candidateTrace)) {
      throw new Error("Persisted Money Now candidate trace does not match selection snapshot.");
    }
  }
  return {
    id: row.id,
    diagnosticId: row.diagnosticId,
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: row.p01AnalysisResultId,
    p01ResultHash: row.p01ResultHash,
    taskResolverPlanId: row.taskResolverPlanId,
    taskResolverPlanHash: row.taskResolverPlanHash,
    stageVersion: row.stageVersion as StoredMoneyNowSelection["stageVersion"],
    selectorContractVersion:
      row.selectorContractVersion as StoredMoneyNowSelection["selectorContractVersion"],
    selectorContractJsonSha256:
      row.selectorContractJsonSha256 as StoredMoneyNowSelection["selectorContractJsonSha256"],
    selectorContractTsSha256:
      row.selectorContractTsSha256 as StoredMoneyNowSelection["selectorContractTsSha256"],
    businessMethodologyVersion:
      row.businessMethodologyVersion as StoredMoneyNowSelection["businessMethodologyVersion"],
    factExtractionVersion:
      row.factExtractionVersion as StoredMoneyNowSelection["factExtractionVersion"],
    selectorInputHash: row.selectorInputHash,
    deterministicInputHash: row.deterministicInputHash,
    selectorInput: parseNullable<MoneyNowSelectorInputV1_1>(row.selectorInputJson),
    snapshot,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    failure: parseNullable<MoneyNowSelectorFailure>(row.failureJson),
  };
}

export function createD1MoneyNowSelectorRepository(): MoneyNowSelectorRepository {
  return {
    async loadSource(analysisRunId): Promise<MoneyNowSelectorSource | null> {
      const db = await getDb();
      const rows = await db
        .select({
          analysisRunId: analysisRuns.id,
          diagnosticId: analysisRuns.diagnosticId,
          runStatus: analysisRuns.status,
          p01: {
            id: p01AnalysisResults.id,
            promptVersion: p01AnalysisResults.promptVersion,
            outputSchemaVersion: p01AnalysisResults.outputSchemaVersion,
            inputHash: p01AnalysisResults.inputHash,
            resultJson: p01AnalysisResults.resultJson,
            failureCode: p01AnalysisResults.failureCode,
          },
          taskResolver: {
            id: resolvedTransitionPlans.id,
            p01AnalysisResultId: resolvedTransitionPlans.p01AnalysisResultId,
            stageVersion: resolvedTransitionPlans.stageVersion,
            transitionRegistryVersion: resolvedTransitionPlans.transitionRegistryVersion,
            deterministicInputHash: resolvedTransitionPlans.deterministicInputHash,
            planJson: resolvedTransitionPlans.planJson,
            failureCode: resolvedTransitionPlans.failureCode,
            failureMessage: resolvedTransitionPlans.failureMessage,
          },
        })
        .from(analysisRuns)
        .leftJoin(p01AnalysisResults, eq(p01AnalysisResults.analysisRunId, analysisRuns.id))
        .leftJoin(
          resolvedTransitionPlans,
          eq(resolvedTransitionPlans.analysisRunId, analysisRuns.id),
        )
        .where(eq(analysisRuns.id, analysisRunId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const hasTaskResolver = row.taskResolver?.id != null;
      return {
        analysisRunId: row.analysisRunId,
        diagnosticId: row.diagnosticId,
        runStatus: row.runStatus,
        p01: {
          id: row.p01?.id ?? null,
          promptVersion: row.p01?.promptVersion ?? null,
          outputSchemaVersion: row.p01?.outputSchemaVersion ?? null,
          inputHash: row.p01?.inputHash ?? null,
          result: parseNullable<P01ResultV1_4_1>(row.p01?.resultJson ?? null),
          failureCode: row.p01?.failureCode ?? null,
        },
        taskResolver: hasTaskResolver
          ? {
              id: row.taskResolver!.id!,
              p01AnalysisResultId: row.taskResolver!.p01AnalysisResultId,
              stageVersion: row.taskResolver!.stageVersion!,
              transitionRegistryVersion: row.taskResolver!.transitionRegistryVersion!,
              deterministicInputHash: row.taskResolver!.deterministicInputHash!,
              plan: parseNullable<ResolvedTransitionPlan>(row.taskResolver!.planJson),
              failureCode: row.taskResolver!.failureCode,
              failureMessage: row.taskResolver!.failureMessage,
            }
          : null,
      };
    },
    async loadResult(analysisRunId) {
      const db = await getDb();
      const rows = await db
        .select()
        .from(moneyNowSelections)
        .where(eq(moneyNowSelections.analysisRunId, analysisRunId))
        .limit(1);
      return rows[0] ? stored(rows[0]) : null;
    },
    async createResult(result) {
      const db = await getDb();
      const inserted = await db
        .insert(moneyNowSelections)
        .values({
          id: result.id,
          diagnosticId: result.diagnosticId,
          analysisRunId: result.analysisRunId,
          p01AnalysisResultId: result.p01AnalysisResultId,
          p01ResultHash: result.p01ResultHash,
          taskResolverPlanId: result.taskResolverPlanId,
          taskResolverPlanHash: result.taskResolverPlanHash,
          stageVersion: result.stageVersion,
          selectorContractVersion: result.selectorContractVersion,
          selectorContractJsonSha256: result.selectorContractJsonSha256,
          selectorContractTsSha256: result.selectorContractTsSha256,
          businessMethodologyVersion: result.businessMethodologyVersion,
          factExtractionVersion: result.factExtractionVersion,
          selectorInputHash: result.selectorInputHash,
          deterministicInputHash: result.deterministicInputHash,
          selectorInputJson: result.selectorInput ? JSON.stringify(result.selectorInput) : null,
          candidateTraceJson: result.snapshot
            ? JSON.stringify(result.snapshot.candidateTrace)
            : null,
          selectionJson: result.snapshot ? JSON.stringify(result.snapshot) : null,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          failureJson: result.failure ? JSON.stringify(result.failure) : null,
        })
        .onConflictDoNothing({ target: moneyNowSelections.analysisRunId })
        .returning({ id: moneyNowSelections.id });
      return inserted.length === 1;
    },
    async updateRun(analysisRunId, update) {
      const db = await getDb();
      const rows = await db
        .select({ modelMetadataJson: analysisRuns.modelMetadataJson })
        .from(analysisRuns)
        .where(eq(analysisRuns.id, analysisRunId))
        .limit(1);
      const metadata = rows[0]?.modelMetadataJson
        ? JSON.parse(rows[0].modelMetadataJson) as Record<string, unknown>
        : {};
      await db
        .update(analysisRuns)
        .set({
          status: update.status,
          errorCode: update.errorCode,
          errorMessage: update.errorMessage,
          modelMetadataJson: JSON.stringify({
            ...metadata,
            deterministicStages: {
              ...((metadata.deterministicStages as Record<string, unknown> | undefined) ?? {}),
              moneyNowSelector: update.metadata,
            },
          }),
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(analysisRuns.id, analysisRunId));
    },
  };
}
