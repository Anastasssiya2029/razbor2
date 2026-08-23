import { buildAnalysisOverview, type AnalysisOverview } from "@/lib/analysis-overview";
import { createD1TargetArchetypeRepository } from "@/server/stage4";

export async function getAnalysisOverview(analysisRunId: string): Promise<AnalysisOverview | null> {
  const stored = await createD1TargetArchetypeRepository().loadResult(analysisRunId);
  if (
    !stored
    || stored.failureCode
    || !stored.currentScores
    || !stored.target
    || !stored.archetype
  ) {
    return null;
  }
  return buildAnalysisOverview({
    currentScores: stored.currentScores,
    target: stored.target,
    archetype: stored.archetype,
  });
}

export type { AnalysisOverview } from "@/lib/analysis-overview";
