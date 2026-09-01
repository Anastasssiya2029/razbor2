import { db, analysisRunsTable, p01AnalysisResultsTable, p02AnalysisResultsTable, resolvedTransitionPlansTable, targetArchetypeResultsTable } from "@workspace/db";
import type { TargetConfigurationResult } from "@/server/7k";
import type { SevenKScores } from "@/server/7k/types";
import type { P01ResultV1_4_2 } from "@/server/p01/types";
import { storedP02ResultFromRow } from "@/server/p02/repository";
import type { TargetArchetypeResourceVersions } from "@/server/stage4/types";
import { eq } from "drizzle-orm";
import type { ResolvedTransitionPlan, StoredResolvedTransitionPlan, TaskResolverRepository, TaskResolverSource } from "./types";

type PlanEnvelope = {
  plan: ResolvedTransitionPlan | null;
  referenceMetadata: Omit<StoredResolvedTransitionPlan, "id" | "analysisRunId" | "p02AnalysisResultId" | "p02ResultHash" | "transitionRegistryVersion" | "deterministicInputHash" | "plan" | "failureCode" | "failureMessage">;
};

function stored(row: typeof resolvedTransitionPlansTable.$inferSelect): StoredResolvedTransitionPlan {
  const envelope = row.plan as unknown as PlanEnvelope | null;
  if (!envelope?.referenceMetadata) throw new Error(`Task Resolver result ${row.id} is missing compact persistence metadata.`);
  const metadata = envelope.referenceMetadata;
  return {
    id: row.id,
    diagnosticId: metadata.diagnosticId,
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: metadata.p01AnalysisResultId,
    targetArchetypeResultId: metadata.targetArchetypeResultId,
    p02AnalysisResultId: row.p02AnalysisResultId,
    p02ResultHash: row.p02ResultHash,
    targetResultHash: metadata.targetResultHash,
    stageVersion: metadata.stageVersion,
    transitionRegistryVersion: row.transitionRegistryVersion as "transitions-70.v2",
    deterministicInputHash: row.deterministicInputHash,
    plan: envelope.plan,
    startedAt: metadata.startedAt,
    completedAt: metadata.completedAt,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
  };
}

export function createD1TaskResolverRepository(): TaskResolverRepository {
  return {
    async loadSource(analysisRunId): Promise<TaskResolverSource | null> {
      const rows = await db.select({
        analysisRunId: analysisRunsTable.id,
        diagnosticId: analysisRunsTable.diagnosticId,
        runStatus: analysisRunsTable.status,
        p01: {
          id: p01AnalysisResultsTable.id,
          promptVersion: p01AnalysisResultsTable.promptVersion,
          outputSchemaVersion: p01AnalysisResultsTable.outputSchemaVersion,
          inputHash: p01AnalysisResultsTable.inputHash,
          result: p01AnalysisResultsTable.result,
          failureCode: p01AnalysisResultsTable.failureCode,
        },
        target: targetArchetypeResultsTable,
        p02: p02AnalysisResultsTable,
      }).from(analysisRunsTable)
        .leftJoin(p01AnalysisResultsTable, eq(p01AnalysisResultsTable.analysisRunId, analysisRunsTable.id))
        .leftJoin(targetArchetypeResultsTable, eq(targetArchetypeResultsTable.analysisRunId, analysisRunsTable.id))
        .leftJoin(p02AnalysisResultsTable, eq(p02AnalysisResultsTable.analysisRunId, analysisRunsTable.id))
        .where(eq(analysisRunsTable.id, analysisRunId)).limit(1);
      const row = rows[0];
      if (!row) return null;
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
        targetStage: row.target ? {
          id: row.target.id,
          p01AnalysisResultId: row.target.p01AnalysisResultId,
          p01InputHash: row.p01?.inputHash ?? null,
          p01ResultHash: row.target.p01ResultHash,
          currentScores: row.target.currentScores as SevenKScores | null,
          // `target` column stores `{ result: TargetConfigurationResult, targetInput }`
          // -- see stage4/repository.ts's `createResult` -- not the bare result.
          target: (row.target.target as { result?: TargetConfigurationResult | null } | null)?.result ?? null,
          resourceVersions: row.target.resourceVersions as TargetArchetypeResourceVersions,
          deterministicInputHash: row.target.deterministicInputHash,
          failureCode: row.target.failureCode,
          failureMessage: row.target.failureMessage,
        } : null,
        p02: row.p02 ? storedP02ResultFromRow(row.p02) : null,
      };
    },
    async loadResult(analysisRunId) {
      const rows = await db.select().from(resolvedTransitionPlansTable).where(eq(resolvedTransitionPlansTable.analysisRunId, analysisRunId)).limit(1);
      return rows[0] ? stored(rows[0]) : null;
    },
    async createResult(result) {
      if (!result.p02AnalysisResultId || !result.p02ResultHash) {
        throw new Error("Task Resolver cannot persist without its required P-02 result.");
      }
      const inserted = await db.insert(resolvedTransitionPlansTable).values({
        analysisRunId: result.analysisRunId,
        p02AnalysisResultId: result.p02AnalysisResultId,
        p02ResultHash: result.p02ResultHash,
        transitionRegistryVersion: result.transitionRegistryVersion,
        deterministicInputHash: result.deterministicInputHash,
        plan: {
          plan: result.plan,
          referenceMetadata: {
            diagnosticId: result.diagnosticId,
            p01AnalysisResultId: result.p01AnalysisResultId,
            targetArchetypeResultId: result.targetArchetypeResultId,
            targetResultHash: result.targetResultHash,
            stageVersion: result.stageVersion,
            startedAt: result.startedAt,
            completedAt: result.completedAt,
          },
        },
        failureCode: result.failureCode,
        failureMessage: result.failureMessage,
      }).onConflictDoNothing({ target: resolvedTransitionPlansTable.analysisRunId }).returning({ id: resolvedTransitionPlansTable.id });
      return inserted.length === 1;
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
          deterministicStages: {
            ...((metadata.deterministicStages as Record<string, unknown> | undefined) ?? {}),
            taskResolver: update.metadata,
          },
        },
      }).where(eq(analysisRunsTable.id, analysisRunId));
    },
  };
}