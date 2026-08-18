import { getDb } from "@/db";
import { analysisRuns, p01AnalysisResults, p02AnalysisResults, resolvedTransitionPlans, targetArchetypeResults } from "@/db/schema";
import type { TargetConfigurationResult } from "@/server/7k";
import type { SevenKScores } from "@/server/7k/types";
import type { P01ResultV1_4_1 } from "@/server/p01/types";
import { storedP02ResultFromRow } from "@/server/p02/repository";
import type { TargetArchetypeResourceVersions } from "@/server/stage4/types";
import { eq, sql } from "drizzle-orm";
import type { ResolvedTransitionPlan, StoredResolvedTransitionPlan, TaskResolverRepository, TaskResolverSource } from "./types";

function parseNullable<T>(value: string | null): T | null {
  return value === null ? null : JSON.parse(value) as T;
}

function stored(row: typeof resolvedTransitionPlans.$inferSelect): StoredResolvedTransitionPlan {
  return {
    id: row.id,
    diagnosticId: row.diagnosticId,
    analysisRunId: row.analysisRunId,
    p01AnalysisResultId: row.p01AnalysisResultId,
    targetArchetypeResultId: row.targetArchetypeResultId,
    p02AnalysisResultId: row.p02AnalysisResultId,
    p02ResultHash: row.p02ResultHash,
    targetResultHash: row.targetResultHash,
    stageVersion: row.stageVersion as "task-resolver-stage.v1",
    transitionRegistryVersion: row.transitionRegistryVersion as "transitions-70.v1",
    deterministicInputHash: row.deterministicInputHash,
    plan: parseNullable<ResolvedTransitionPlan>(row.planJson),
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
  };
}

export function createD1TaskResolverRepository(): TaskResolverRepository {
  return {
    async loadSource(analysisRunId): Promise<TaskResolverSource | null> {
      const db = await getDb();
      const rows = await db.select({
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
        target: {
          id: targetArchetypeResults.id,
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
        p02: p02AnalysisResults,
      }).from(analysisRuns)
        .leftJoin(p01AnalysisResults, eq(p01AnalysisResults.analysisRunId, analysisRuns.id))
        .leftJoin(targetArchetypeResults, eq(targetArchetypeResults.analysisRunId, analysisRuns.id))
        .leftJoin(p02AnalysisResults, eq(p02AnalysisResults.analysisRunId, analysisRuns.id))
        .where(eq(analysisRuns.id, analysisRunId)).limit(1);
      const row = rows[0];
      if (!row) return null;
      const p01Row = row.p01;
      const targetRow = row.target;
      const p02Row = row.p02;
      const hasTarget = targetRow?.id != null;
      const hasP02 = p02Row?.id != null;
      return {
        analysisRunId: row.analysisRunId,
        diagnosticId: row.diagnosticId,
        runStatus: row.runStatus,
        p01: {
          id: p01Row?.id ?? null,
          promptVersion: p01Row?.promptVersion ?? null,
          outputSchemaVersion: p01Row?.outputSchemaVersion ?? null,
          inputHash: p01Row?.inputHash ?? null,
          result: parseNullable<P01ResultV1_4_1>(p01Row?.resultJson ?? null),
          failureCode: p01Row?.failureCode ?? null,
        },
        targetStage: hasTarget ? {
          id: targetRow!.id!,
          p01AnalysisResultId: targetRow!.p01AnalysisResultId,
          p01InputHash: targetRow!.p01InputHash,
          p01ResultHash: targetRow!.p01ResultHash,
          currentScores: parseNullable<SevenKScores>(targetRow!.currentScoresJson),
          target: parseNullable<TargetConfigurationResult>(targetRow!.targetResultJson),
          resourceVersions: JSON.parse(targetRow!.resourceVersionsJson!) as TargetArchetypeResourceVersions,
          deterministicInputHash: targetRow!.deterministicInputHash!,
          failureCode: targetRow!.failureCode,
          failureMessage: targetRow!.failureMessage,
        } : null,
        p02: hasP02 ? storedP02ResultFromRow(p02Row as typeof p02AnalysisResults.$inferSelect) : null,
      };
    },
    async loadResult(analysisRunId) {
      const db = await getDb();
      const rows = await db.select().from(resolvedTransitionPlans).where(eq(resolvedTransitionPlans.analysisRunId, analysisRunId)).limit(1);
      return rows[0] ? stored(rows[0]) : null;
    },
    async createResult(result) {
      const db = await getDb();
      const inserted = await db.insert(resolvedTransitionPlans).values({
        id: result.id,
        diagnosticId: result.diagnosticId,
        analysisRunId: result.analysisRunId,
        p01AnalysisResultId: result.p01AnalysisResultId,
        targetArchetypeResultId: result.targetArchetypeResultId,
        p02AnalysisResultId: result.p02AnalysisResultId,
        p02ResultHash: result.p02ResultHash,
        targetResultHash: result.targetResultHash,
        stageVersion: result.stageVersion,
        transitionRegistryVersion: result.transitionRegistryVersion,
        deterministicInputHash: result.deterministicInputHash,
        planJson: result.plan ? JSON.stringify(result.plan) : null,
        startedAt: result.startedAt,
        completedAt: result.completedAt,
        failureCode: result.failureCode,
        failureMessage: result.failureMessage,
      }).onConflictDoNothing({ target: resolvedTransitionPlans.analysisRunId }).returning({ id: resolvedTransitionPlans.id });
      return inserted.length === 1;
    },
    async updateRun(analysisRunId, update) {
      const db = await getDb();
      const rows = await db.select({ modelMetadataJson: analysisRuns.modelMetadataJson })
        .from(analysisRuns).where(eq(analysisRuns.id, analysisRunId)).limit(1);
      const models = rows[0]?.modelMetadataJson ? JSON.parse(rows[0].modelMetadataJson) as Record<string, unknown> : {};
      await db.update(analysisRuns).set({
        status: update.status,
        errorCode: update.errorCode,
        errorMessage: update.errorMessage,
        modelMetadataJson: JSON.stringify({
          ...models,
          deterministicStages: {
            ...((models.deterministicStages as Record<string, unknown> | undefined) ?? {}),
            taskResolver: update.metadata,
          },
        }),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }).where(eq(analysisRuns.id, analysisRunId));
    },
  };
}
