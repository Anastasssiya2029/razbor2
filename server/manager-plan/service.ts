import { getDb } from "@/db";
import { analysisPlanManagerVersions } from "@/db/schema";
import type { ManagerPlanVersion } from "@/lib/analysis-checklist";
import { getOrCreateAnalysisResult } from "@/server/analysis-result";
import { eq, sql } from "drizzle-orm";
import type { SaveManagerPlanInput } from "./types";
import { ManagerPlanError } from "./types";
import { validateManagerPlanContent } from "./validation";

function versionFromRow(row: typeof analysisPlanManagerVersions.$inferSelect): ManagerPlanVersion {
  const content = JSON.parse(row.contentJson) as Pick<ManagerPlanVersion, "version" | "cards">;
  return {
    ...content,
    sourceResultHash: row.sourceResultHash,
    revision: row.revision,
    updatedAt: row.updatedAt,
  };
}

export async function getManagerPlanVersion(analysisRunId: string): Promise<ManagerPlanVersion | null> {
  const db = await getDb();
  const rows = await db.select().from(analysisPlanManagerVersions)
    .where(eq(analysisPlanManagerVersions.analysisRunId, analysisRunId)).limit(1);
  return rows[0] ? versionFromRow(rows[0]) : null;
}

export async function saveManagerPlanVersion(input: SaveManagerPlanInput): Promise<ManagerPlanVersion> {
  const assembled = await getOrCreateAnalysisResult(input.analysisRunId);
  const currentHash = assembled.result.provenance.assemblyInputHash;
  if (input.sourceResultHash !== currentHash) {
    throw new ManagerPlanError(
      "MANAGER_PLAN_SOURCE_CHANGED",
      409,
      "Исходный план изменился. Обновите страницу перед сохранением.",
    );
  }
  const content = validateManagerPlanContent(input.content, assembled.result);
  const db = await getDb();
  const rows = await db.insert(analysisPlanManagerVersions).values({
    id: crypto.randomUUID(),
    analysisRunId: input.analysisRunId,
    sourceResultHash: currentHash,
    contentJson: JSON.stringify(content),
    updatedByUserId: input.actorUserId,
  }).onConflictDoUpdate({
    target: analysisPlanManagerVersions.analysisRunId,
    set: {
      sourceResultHash: currentHash,
      contentJson: JSON.stringify(content),
      revision: sql`${analysisPlanManagerVersions.revision} + 1`,
      updatedByUserId: input.actorUserId,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    },
  }).returning();
  if (!rows[0]) throw new Error("MANAGER_PLAN_PERSISTENCE_FAILED");
  return versionFromRow(rows[0]);
}
