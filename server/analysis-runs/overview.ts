import { buildAnalysisOverview, type AnalysisOverview } from "@/lib/analysis-overview";
import { createD1TargetArchetypeRepository } from "@/server/stage4";

export async function getAnalysisOverview(analysisRunId: string): Promise<AnalysisOverview | null> {
  const repository = createD1TargetArchetypeRepository();
  const [stored, source] = await Promise.all([
    repository.loadResult(analysisRunId),
    repository.loadSource(analysisRunId),
  ]);
  if (
    !stored
    || !source
    || stored.failureCode
    || source.p01FailureCode
    || !source.p01Result
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
    p01: source.p01Result,
  });
}

export type { AnalysisOverview } from "@/lib/analysis-overview";
