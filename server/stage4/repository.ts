import { getDb } from "@/db";
import {
  analysisRuns,
  diagnostics,
  p01AnalysisResults,
  targetArchetypeResults,
} from "@/db/schema";
import { validateDiagnosticInput } from "@/lib/diagnostic-input";
import type { BusinessArchetypeResult, TargetConfigurationInput, TargetConfigurationResult } from "@/server/7k";
import type { SevenKScores } from "@/server/7k/types";
import type { P01ResultV1_4_1 } from "@/server/p01/types";
import { and, eq, sql } from "drizzle-orm";
import type {
  Stage4Source,
  StoredTargetArchetypeResult,
  TargetArchetypeRepository,
  TargetArchetypeResourceVersions,
} from "./types";

function parseNullable<T>(value: string | null): T | null {
  return value === null ? null : (JSON.parse(value) as T);
}

export function createD1TargetArchetypeRepository(): TargetArchetypeRepository {
  return {
    async loadSource(analysisRunId): Promise<Stage4Source | null> {
      const db = await getDb();
      const rows = await db
        .select({
          analysisRunId: analysisRuns.id,
          diagnosticId: analysisRuns.diagnosticId,
          runStatus: analysisRuns.status,
          normalizedInputJson: diagnostics.normalizedInputJson,
          p01AnalysisResultId: p01AnalysisResults.id,
          p01PromptVersion: p01AnalysisResults.promptVersion,
          p01OutputSchemaVersion: p01AnalysisResults.outputSchemaVersion,
          p01InputHash: p01AnalysisResults.inputHash,
          p01ResultJson: p01AnalysisResults.resultJson,
          p01FailureCode: p01AnalysisResults.failureCode,
          p01FailureMessage: p01AnalysisResults.failureMessage,
        })
        .from(analysisRuns)
        .innerJoin(diagnostics, eq(analysisRuns.diagnosticId, diagnostics.id))
        .leftJoin(
          p01AnalysisResults,
          and(
            eq(p01AnalysisResults.analysisRunId, analysisRuns.id),
            eq(p01AnalysisResults.diagnosticId, diagnostics.id),
          ),
        )
        .where(eq(analysisRuns.id, analysisRunId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        analysisRunId: row.analysisRunId,
        diagnosticId: row.diagnosticId,
        runStatus: row.runStatus,
        normalizedInput: validateDiagnosticInput(JSON.parse(row.normalizedInputJson)),
        p01AnalysisResultId: row.p01AnalysisResultId,
        p01PromptVersion: row.p01PromptVersion,
        p01OutputSchemaVersion: row.p01OutputSchemaVersion,
        p01InputHash: row.p01InputHash,
        p01Result: parseNullable<P01ResultV1_4_1>(row.p01ResultJson),
        p01FailureCode: row.p01FailureCode,
        p01FailureMessage: row.p01FailureMessage,
      };
    },

    async loadResult(analysisRunId): Promise<StoredTargetArchetypeResult | null> {
      const db = await getDb();
      const rows = await db
        .select()
        .from(targetArchetypeResults)
        .where(eq(targetArchetypeResults.analysisRunId, analysisRunId))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
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
    },

    async createResult(result): Promise<boolean> {
      const db = await getDb();
      const inserted = await db
        .insert(targetArchetypeResults)
        .values({
          id: result.id,
          diagnosticId: result.diagnosticId,
          analysisRunId: result.analysisRunId,
          p01AnalysisResultId: result.p01AnalysisResultId,
          p01InputHash: result.p01InputHash,
          p01ResultHash: result.p01ResultHash,
          currentScoresJson: result.currentScores ? JSON.stringify(result.currentScores) : null,
          targetInputJson: result.targetInput ? JSON.stringify(result.targetInput) : null,
          targetResultJson: result.target ? JSON.stringify(result.target) : null,
          archetypeResultJson: result.archetype ? JSON.stringify(result.archetype) : null,
          resourceVersionsJson: JSON.stringify(result.resourceVersions),
          deterministicInputHash: result.deterministicInputHash,
          startedAt: result.startedAt,
          completedAt: result.completedAt,
          failureCode: result.failureCode,
          failureMessage: result.failureMessage,
        })
        .onConflictDoNothing({ target: targetArchetypeResults.analysisRunId })
        .returning({ id: targetArchetypeResults.id });
      return inserted.length === 1;
    },

    async updateRun(analysisRunId, update): Promise<void> {
      const db = await getDb();
      const current = await db
        .select({ modelMetadataJson: analysisRuns.modelMetadataJson })
        .from(analysisRuns)
        .where(eq(analysisRuns.id, analysisRunId))
        .limit(1);
      const previousMetadata = current[0]?.modelMetadataJson
        ? (JSON.parse(current[0].modelMetadataJson) as Record<string, unknown>)
        : {};
      await db
        .update(analysisRuns)
        .set({
          status: update.status,
          errorCode: update.errorCode,
          errorMessage: update.errorMessage,
          modelMetadataJson: JSON.stringify({
            ...previousMetadata,
            deterministicStages: {
              ...((previousMetadata.deterministicStages as Record<string, unknown> | undefined) ?? {}),
              targetArchetype: update.methodologyMetadata,
            },
          }),
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(analysisRuns.id, analysisRunId));
    },
  };
}
