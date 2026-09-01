import type { ArchetypeId, SystemElementId, SystemScore } from "./business-analysis";
import type {
  BusinessArchetypeResult,
  P01ResultV1_4_2,
  TargetConfigurationResult,
} from "./server/analysis-result-types";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId, type SevenKScores } from "./server/7k/types";

export type AnalysisScoreArgument = {
  id: SystemElementId;
  score: number;
  evidence: string[];
  matchedCriterion: string | null;
  whyNotHigher: string | null;
  kind: "soft" | "hard";
};

export type AnalysisOverview = {
  archetype: {
    id: ArchetypeId;
    evidence: string[];
  };
  systemScores: SystemScore[];
  currentScoreArguments: AnalysisScoreArgument[];
  modelTransitionNote?: string | null;
};

const presentationElementIds: Record<SevenKElementId, SystemElementId> = {
  authenticity: "authenticity",
  audience: "audience",
  product_method: "products_method",
  sales_technology: "sales_technology",
  funnel: "funnel",
  blog: "blog",
  team: "team",
};

export function buildAnalysisOverview(input: {
  currentScores: SevenKScores;
  target: TargetConfigurationResult;
  archetype: BusinessArchetypeResult;
  p01: Pick<P01ResultV1_4_2, "current7k" | "evidenceLedger">;
}): AnalysisOverview {
  return {
    archetype: {
      id: input.archetype.finalArchetype,
      evidence: [],
    },
    systemScores: SEVEN_K_ELEMENT_IDS.map((elementId) => ({
      id: presentationElementIds[elementId],
      currentScore: input.currentScores[elementId],
      targetScore: input.target.targetScores[elementId],
      reasoning: "Уровни рассчитаны по данным диагностики и правилам целевой конфигурации 7К.",
    })),
    currentScoreArguments: SEVEN_K_ELEMENT_IDS.map((elementId) => ({
        id: presentationElementIds[elementId],
        score: input.currentScores[elementId],
        evidence: [],
        matchedCriterion: null,
        whyNotHigher: null,
        kind: elementId === "authenticity" || elementId === "audience" ? "soft" : "hard",
      })),
    modelTransitionNote: input.target.modelTransitionNote ?? null,
  };
}
