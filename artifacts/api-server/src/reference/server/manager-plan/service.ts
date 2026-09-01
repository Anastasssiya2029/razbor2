import {
  analysisPlanManagerVersionsTable as analysisPlanManagerVersions,
  analysisResultsTable as analysisResults,
  analysisRunsTable as analysisRuns,
  db,
  diagnosticsTable as diagnostics,
} from "@workspace/db";
import { buildCanonicalChecklist, type ChecklistTask, type ManagerPlanVersion } from "@/lib/analysis-checklist";
import { getOrCreateAnalysisResult } from "@/server/analysis-result";
import { count, desc, eq } from "drizzle-orm";
import type { SaveManagerPlanInput } from "./types";
import { ManagerPlanError } from "./types";
import { validateManagerPlanContent } from "./validation";

// `current.weeklyHours` is a raw diagnostic-form answer, not part of the P01-P04
// pipeline output (AnalysisResultV1 never carries it). Read it directly from the
// diagnostic record so both the GET snapshot and the save-time canonical
// checklist agree with what the client rendered (which reads the same field
// from the diagnostic it already has loaded).
async function getCurrentWeeklyHours(analysisRunId: string): Promise<number | null> {
  const rows = await db.select({ normalizedInput: diagnostics.normalizedInput })
    .from(analysisRuns)
    .innerJoin(diagnostics, eq(diagnostics.id, analysisRuns.diagnosticId))
    .where(eq(analysisRuns.id, analysisRunId))
    .limit(1);
  const normalizedInput = rows[0]?.normalizedInput as { current?: { weeklyHours?: number | null } } | undefined;
  return normalizedInput?.current?.weeklyHours ?? null;
}

export type ManagerPlanCardSnapshot = { elementId: string; tasks: ChecklistTask[] };

export type ManagerPlanSnapshot = {
  managerPlan: ManagerPlanVersion | null;
  canonicalCards: ManagerPlanCardSnapshot[];
  sourceResultHash: string;
};

function versionFromRow(row: typeof analysisPlanManagerVersions.$inferSelect): ManagerPlanVersion {
  return {
    version: "manager-plan.v1",
    cards: row.planItems as ManagerPlanVersion["cards"],
    sourceResultHash: "",
    revision: 1,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getManagerPlanVersion(analysisRunId: string): Promise<ManagerPlanSnapshot> {
  const [assembled, currentWeeklyHours] = await Promise.all([
    getOrCreateAnalysisResult(analysisRunId),
    getCurrentWeeklyHours(analysisRunId),
  ]);
  const sourceResultHash = assembled.result.provenance.assemblyInputHash;
  const canonicalCards: ManagerPlanCardSnapshot[] = buildCanonicalChecklist(assembled.result, currentWeeklyHours).map((card) => ({
    elementId: card.elementId,
    tasks: card.tasks,
  }));

  const rows = await db.select({
    plan: analysisPlanManagerVersions,
    analysisResultId: analysisPlanManagerVersions.analysisResultId,
    sourceResultHash: analysisResults.resultHash,
  }).from(analysisResults)
    .innerJoin(analysisPlanManagerVersions, eq(analysisPlanManagerVersions.analysisResultId, analysisResults.id))
    .where(eq(analysisResults.analysisRunId, analysisRunId))
    .orderBy(desc(analysisPlanManagerVersions.updatedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return { managerPlan: null, canonicalCards, sourceResultHash };
  const revisionRows = await db.select({ value: count() })
    .from(analysisPlanManagerVersions)
    .where(eq(analysisPlanManagerVersions.analysisResultId, row.analysisResultId));
  const managerPlan: ManagerPlanVersion = {
    ...versionFromRow(row.plan),
    sourceResultHash: row.sourceResultHash,
    revision: Number(revisionRows[0]?.value ?? 0),
  };
  return { managerPlan, canonicalCards, sourceResultHash };
}

export async function saveManagerPlanVersion(input: SaveManagerPlanInput): Promise<ManagerPlanVersion> {
  const [assembled, currentWeeklyHours] = await Promise.all([
    getOrCreateAnalysisResult(input.analysisRunId),
    getCurrentWeeklyHours(input.analysisRunId),
  ]);
  const currentHash = assembled.result.provenance.assemblyInputHash;
  if (input.sourceResultHash !== currentHash) {
    throw new ManagerPlanError(
      "MANAGER_PLAN_SOURCE_CHANGED",
      409,
      "Исходный план изменился. Обновите страницу перед сохранением.",
    );
  }
  const content = validateManagerPlanContent(input.content, assembled.result, currentWeeklyHours);
  const resultRows = await db.select({ id: analysisResults.id })
    .from(analysisResults)
    .where(eq(analysisResults.analysisRunId, input.analysisRunId))
    .limit(1);
  const result = resultRows[0];
  if (!result) throw new Error("MANAGER_PLAN_RESULT_NOT_FOUND");
  const revisionRows = await db.select({ value: count() })
    .from(analysisPlanManagerVersions)
    .where(eq(analysisPlanManagerVersions.analysisResultId, result.id));
  const rows = await db.insert(analysisPlanManagerVersions).values({
    analysisResultId: result.id,
    managerUserId: input.actorUserId,
    planItems: content.cards as Record<string, unknown>[],
  }).returning();
  if (!rows[0]) throw new Error("MANAGER_PLAN_PERSISTENCE_FAILED");
  return {
    ...versionFromRow(rows[0]),
    sourceResultHash: currentHash,
    revision: Number(revisionRows[0]?.value ?? 0) + 1,
  };
}
