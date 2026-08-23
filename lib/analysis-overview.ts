import type { ArchetypeId, SystemElementId, SystemScore } from "./business-analysis";
import type { BusinessArchetypeResult, TargetConfigurationResult } from "../server/7k";
import type { P01ResultV1_4_2 } from "../server/p01/types";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId, type SevenKScores } from "../server/7k/types";

export type AnalysisScoreArgument = {
  id: SystemElementId;
  score: number;
  evidence: string[];
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

function conciseArgument(value: string | null | undefined, maxLength = 220): string | null {
  const normalized = value?.replace(/\s+/gu, " ").trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  const clipped = normalized.slice(0, maxLength - 1).replace(/\s+\S*$/u, "").trimEnd();
  return `${clipped || normalized.slice(0, maxLength - 1)}…`;
}

export function buildAnalysisOverview(input: {
  currentScores: SevenKScores;
  target: TargetConfigurationResult;
  archetype: BusinessArchetypeResult;
  p01: Pick<P01ResultV1_4_2, "current7k" | "evidenceLedger">;
}): AnalysisOverview {
  const evidenceById = new Map(input.p01.evidenceLedger.map((item) => [item.id, item.fact]));

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
    currentScoreArguments: SEVEN_K_ELEMENT_IDS.map((elementId) => {
      const score = input.p01.current7k[elementId];
      const evidence = [...score.evidence_ids, ...score.counterevidence_ids]
        .map((evidenceId) => conciseArgument(evidenceById.get(evidenceId)))
        .filter((fact): fact is string => Boolean(fact))
        .filter((fact, index, facts) => facts.indexOf(fact) === index)
        .slice(0, 1);
      return {
        id: presentationElementIds[elementId],
        score: input.currentScores[elementId],
        evidence,
        whyNotHigher: conciseArgument(score.why_not_higher),
        kind: elementId === "authenticity" || elementId === "audience" ? "soft" : "hard",
      };
    }),
    modelTransitionNote: input.target.modelTransitionNote ?? null,
  };
}
