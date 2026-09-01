import {
  analysisRunsTable,
  db,
  diagnosticsTable,
  p01AnalysisResultsTable,
  targetArchetypeResultsTable,
} from "@workspace/db";
import { validateDiagnosticInput } from "@/lib/diagnostic-input";
import type { BusinessArchetypeResult, TargetConfigurationInput, TargetConfigurationResult } from "@/server/7k";
import type { SevenKScores } from "@/server/7k/types";
import type { P01ResultV1_4_2 } from "@/server/p01/types";
import { and, eq } from "drizzle-orm";
import type {
  Stage4Source,
  StoredTargetArchetypeResult,
  TargetArchetypeRepository,
  TargetArchetypeResourceVersions,
} from "./types";

export function createD1TargetArchetypeRepository(): TargetArchetypeRepository {
  return {
    async loadSource(analysisRunId): Promise<Stage4Source | null> {
      const rows = await db
        .select({
          analysisRunId: analysisRunsTable.id,
          diagnosticId: analysisRunsTable.diagnosticId,
          runStatus: analysisRunsTable.status,
          normalizedInput: diagnosticsTable.normalizedInput,
          p01AnalysisResultId: p01AnalysisResultsTable.id,
          p01PromptVersion: p01AnalysisResultsTable.promptVersion,
          p01OutputSchemaVersion: p01AnalysisResultsTable.outputSchemaVersion,
          p01InputHash: p01AnalysisResultsTable.inputHash,
          p01Result: p01AnalysisResultsTable.result,
          p01FailureCode: p01AnalysisResultsTable.failureCode,
          p01FailureMessage: p01AnalysisResultsTable.failureMessage,
        })
        .from(analysisRunsTable)
        .innerJoin(diagnosticsTable, eq(analysisRunsTable.diagnosticId, diagnosticsTable.id))
        .leftJoin(
          p01AnalysisResultsTable,
          and(
            eq(p01AnalysisResultsTable.analysisRunId, analysisRunsTable.id),
            eq(p01AnalysisResultsTable.diagnosticId, diagnosticsTable.id),
          ),
        )
        .where(eq(analysisRunsTable.id, analysisRunId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        analysisRunId: row.analysisRunId,
        diagnosticId: row.diagnosticId,
        runStatus: row.runStatus,
        normalizedInput: validateDiagnosticInput(row.normalizedInput),
        p01AnalysisResultId: row.p01AnalysisResultId,
        p01PromptVersion: row.p01PromptVersion,
        p01OutputSchemaVersion: row.p01OutputSchemaVersion,
        p01InputHash: row.p01InputHash,
        p01Result: row.p01Result as P01ResultV1_4_2 | null,
        p01FailureCode: row.p01FailureCode,
        p01FailureMessage: row.p01FailureMessage,
      };
    },

    async loadResult(analysisRunId): Promise<StoredTargetArchetypeResult | null> {
      const rows = await db
        .select()
        .from(targetArchetypeResultsTable)
        .where(eq(targetArchetypeResultsTable.analysisRunId, analysisRunId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      const targetSnapshot = row.target as
        | { result?: TargetConfigurationResult | null; targetInput?: TargetConfigurationInput | null }
        | null;
      const archetypeSnapshot = row.archetype as
        | {
            result?: BusinessArchetypeResult | null;
            diagnosticId?: string;
            p01InputHash?: string | null;
            startedAt?: string;
            completedAt?: string;
          }
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
    },

    async createResult(result): Promise<boolean> {
      const inserted = await db
        .insert(targetArchetypeResultsTable)
        .values({
          analysisRunId: result.analysisRunId,
          // Stage 4 is only persisted after a P-01 snapshot is available.
          p01AnalysisResultId: result.p01AnalysisResultId!,
          p01ResultHash: result.p01ResultHash!,
          currentScores: result.currentScores,
          // The compact Postgres schema keeps target input alongside its computed target.
          target: { result: result.target, targetInput: result.targetInput },
          // Retain reference-only audit fields alongside the archetype snapshot.
          archetype: {
            result: result.archetype,
            diagnosticId: result.diagnosticId,
            p01InputHash: result.p01InputHash,
            startedAt: result.startedAt,
            completedAt: result.completedAt,
          },
          resourceVersions: result.resourceVersions,
          deterministicInputHash: result.deterministicInputHash,
          failureCode: result.failureCode,
          failureMessage: result.failureMessage,
        })
        .onConflictDoNothing({ target: targetArchetypeResultsTable.analysisRunId })
        .returning({ id: targetArchetypeResultsTable.id });
      return inserted.length === 1;
    },

    async updateRun(analysisRunId, update): Promise<void> {
      const current = await db
        .select({ metadata: analysisRunsTable.metadata })
        .from(analysisRunsTable)
        .where(eq(analysisRunsTable.id, analysisRunId))
        .limit(1);
      const previousMetadata = current[0]?.metadata ?? {};
      await db
        .update(analysisRunsTable)
        .set({
          status: update.status,
          errorCode: update.errorCode,
          errorMessage: update.errorMessage,
          metadata: {
            ...previousMetadata,
            deterministicStages: {
              ...((previousMetadata.deterministicStages as Record<string, unknown> | undefined) ?? {}),
              targetArchetype: update.methodologyMetadata,
            },
          },
        })
        .where(eq(analysisRunsTable.id, analysisRunId));
    },
  };
}
