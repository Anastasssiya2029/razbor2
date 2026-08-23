import type { ArchetypeId, SystemElementId, SystemScore } from "./business-analysis";
import type { BusinessArchetypeResult, TargetConfigurationResult } from "../server/7k";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId, type SevenKScores } from "../server/7k/types";

export type AnalysisOverview = {
  archetype: {
    id: ArchetypeId;
    evidence: string[];
  };
  systemScores: SystemScore[];
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
  };
}
