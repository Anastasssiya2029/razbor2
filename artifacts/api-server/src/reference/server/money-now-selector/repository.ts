import {
  analysisRunsTable as analysisRuns,
  db,
  moneyNowSelectionsTable as moneyNowSelections,
  p01AnalysisResultsTable as p01AnalysisResults,
  resolvedTransitionPlansTable as resolvedTransitionPlans,
} from "@workspace/db";
import type { P01ResultV1_4_2 } from "@/server/p01/types";
import type { ResolvedTransitionPlan } from "@/server/task-resolver/types";
import { eq } from "drizzle-orm";
import type {
  MoneyNowSelectionSnapshot,
  MoneyNowSelectorFailure,
  MoneyNowSelectorInputV1_1,
  MoneyNowSelectorRepository,
  MoneyNowSelectorSource,
  StoredMoneyNowSelection,
} from "./types";

type SelectionPersistence = {
  snapshot: MoneyNowSelectionSnapshot | null;
  diagnosticId: string;
  p01ResultHash: string | null;
  taskResolverPlanId: string | null;
  taskResolverPlanHash: string | null;
  stageVersion: StoredMoneyNowSelection["stageVersion"];
  selectorContractJsonSha256: StoredMoneyNowSelection["selectorContractJsonSha256"];
  selectorContractTsSha256: StoredMoneyNowSelection["selectorContractTsSha256"];
  factExtractionVersion: StoredMoneyNowSelection["factExtractionVersion"];
  selectorInputHash: string | null;
  startedAt: string;
  completedAt: string;
  failure: MoneyNowSelectorFailure | null;
};

export function storedMoneyNowSelectionFromRow(
  row: typeof moneyNowSelections.$inferSelect,
): StoredMoneyNowSelection {
  const persistence = row.snapshot as unknown as SelectionPersistence | null;
  const snapshot = persistence?.snapshot ?? null;
  return {
    id: row.id,
    diagnosticId: persistence?.diagnosticId ?? "",
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: row.p01AnalysisResultId,
    p01ResultHash: persistence?.p01ResultHash ?? null,
    taskResolverPlanId: persistence?.taskResolverPlanId ?? row.resolvedTransitionPlanId,
    taskResolverPlanHash: persistence?.taskResolverPlanHash ?? null,
    stageVersion: persistence?.stageVersion ?? "money-now-selector-stage.v1",
    selectorContractVersion:
      row.selectorContractVersion as StoredMoneyNowSelection["selectorContractVersion"],
    selectorContractJsonSha256:
      persistence?.selectorContractJsonSha256
      ?? "caef74cee52cfd061fdf0e962d9624fb8ff2024d7a515493ce2c6e48ca91ad5c",
    selectorContractTsSha256:
      persistence?.selectorContractTsSha256
      ?? "85c9b26e03f7583e3d46f995be4cf400b8f2bfcfc2842675627ae9497041045b",
    businessMethodologyVersion:
      row.businessMethodologyVersion as StoredMoneyNowSelection["businessMethodologyVersion"],
    factExtractionVersion:
      persistence?.factExtractionVersion ?? "money-now-fact-extraction.v1",
    selectorInputHash: persistence?.selectorInputHash ?? null,
    deterministicInputHash: row.deterministicInputHash,
    selectorInput: row.selectorInput as MoneyNowSelectorInputV1_1 | null,
    snapshot,
    startedAt: persistence?.startedAt ?? row.createdAt.toISOString(),
    completedAt: persistence?.completedAt ?? row.createdAt.toISOString(),
    failure: persistence?.failure ?? (row.failureCode
      ? { code: row.failureCode, message: row.failureMessage ?? "", kind: "technical", details: null }
      : null),
  };
}

export function createD1MoneyNowSelectorRepository(): MoneyNowSelectorRepository {
  return {
    async loadSource(analysisRunId): Promise<MoneyNowSelectorSource | null> {
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
            result: p01AnalysisResults.result,
            failureCode: p01AnalysisResults.failureCode,
          },
          taskResolver: {
            id: resolvedTransitionPlans.id,
            transitionRegistryVersion: resolvedTransitionPlans.transitionRegistryVersion,
            deterministicInputHash: resolvedTransitionPlans.deterministicInputHash,
            plan: resolvedTransitionPlans.plan,
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
          result: row.p01?.result as P01ResultV1_4_2 | null,
          failureCode: row.p01?.failureCode ?? null,
        },
        taskResolver: hasTaskResolver
          ? {
              id: row.taskResolver!.id!,
              p01AnalysisResultId: row.p01?.id ?? null,
              stageVersion: "task-resolver-stage.v1",
              transitionRegistryVersion: row.taskResolver!.transitionRegistryVersion!,
              deterministicInputHash: row.taskResolver!.deterministicInputHash!,
              // `plan` column stores `{ plan: ResolvedTransitionPlan, referenceMetadata }`
              // -- unwrap to the inner plan, matching task-resolver/repository.ts's
              // own `stored()` and p04/repository.ts's `storedPlan()`. Hashing the
              // raw envelope here previously desynced `taskResolverPlanHash` from
              // p04's freshly-computed `sha256(resolved.plan)`.
              plan: (row.taskResolver!.plan as { plan?: ResolvedTransitionPlan | null } | null)?.plan ?? null,
              failureCode: row.taskResolver!.failureCode,
              failureMessage: row.taskResolver!.failureMessage,
            }
          : null,
      };
    },
    async loadResult(analysisRunId) {
      const rows = await db
        .select()
        .from(moneyNowSelections)
        .where(eq(moneyNowSelections.analysisRunId, analysisRunId))
        .limit(1);
      return rows[0] ? storedMoneyNowSelectionFromRow(rows[0]) : null;
    },
    async createResult(result) {
      const inserted = await db
        .insert(moneyNowSelections)
        .values({
          analysisRunId: result.analysisRunId,
          p01AnalysisResultId: result.p01AnalysisResultId!,
          resolvedTransitionPlanId: result.taskResolverPlanId!,
          selectorContractVersion: result.selectorContractVersion,
          businessMethodologyVersion: result.businessMethodologyVersion,
          deterministicInputHash: result.deterministicInputHash,
          selectorInput: result.selectorInput,
          selectionStatus: result.snapshot?.selectionStatus ?? "no_eligible_scenario",
          snapshot: {
            snapshot: result.snapshot,
            diagnosticId: result.diagnosticId,
            p01ResultHash: result.p01ResultHash,
            taskResolverPlanId: result.taskResolverPlanId,
            taskResolverPlanHash: result.taskResolverPlanHash,
            stageVersion: result.stageVersion,
            selectorContractJsonSha256: result.selectorContractJsonSha256,
            selectorContractTsSha256: result.selectorContractTsSha256,
            factExtractionVersion: result.factExtractionVersion,
            selectorInputHash: result.selectorInputHash,
            startedAt: result.startedAt,
            completedAt: result.completedAt,
            failure: result.failure,
          },
          failureCode: result.failure?.code ?? null,
          failureMessage: result.failure?.message ?? null,
        })
        .onConflictDoNothing({ target: moneyNowSelections.analysisRunId })
        .returning({ id: moneyNowSelections.id });
      return inserted.length === 1;
    },
    async updateRun(analysisRunId, update) {
      const rows = await db
        .select({ metadata: analysisRuns.metadata })
        .from(analysisRuns)
        .where(eq(analysisRuns.id, analysisRunId))
        .limit(1);
      const metadata = rows[0]?.metadata ?? {};
      await db
        .update(analysisRuns)
        .set({
          status: update.status,
          errorCode: update.errorCode,
          errorMessage: update.errorMessage,
          metadata: {
            ...metadata,
            deterministicStages: {
              ...((metadata.deterministicStages as Record<string, unknown> | undefined) ?? {}),
              moneyNowSelector: update.metadata,
            },
          },
        })
        .where(eq(analysisRuns.id, analysisRunId));
    },
  };
}
