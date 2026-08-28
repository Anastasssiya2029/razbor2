import scoringRulesJson from "./scoring-rules.v2.0.json";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId } from "../types";

export const SCORING_RULES_RESOURCE_VERSION = "scoring-rules.v2.0" as const;

export type ScoringLevelRule = {
  score: number;
  ruleId: string;
  criterion: string;
  nextLevelGate: string | null;
  nextLevelRuleId: string | null;
};

export type ElementScoringRules = {
  elementId: SevenKElementId;
  evidenceDimensions: string[];
  falseFriends: string[];
  managerQuestions?: string[];
  levels: ScoringLevelRule[];
};

export type ScoringRulesResource = {
  version: typeof SCORING_RULES_RESOURCE_VERSION;
  methodologyVersion: string;
  source: {
    document: string;
    sha256: string;
    importPolicy: string;
  };
  algorithm: "highest_fully_supported_cumulative";
  evaluationPolicy: {
    mode: "cumulative_capability";
    criterionRole: "mandatory_core";
    supportingCoverageTargetPct: number;
    directHigherEvidence: string;
    blockerPolicy: string;
    artifactPolicy: string;
  };
  globalRules: Array<{ ruleId: string; rule: string }>;
  elements: Record<SevenKElementId, ElementScoringRules>;
};

export const SCORING_RULES = scoringRulesJson as ScoringRulesResource;

function validateScoringRules(): void {
  if (SCORING_RULES.version !== SCORING_RULES_RESOURCE_VERSION) {
    throw new Error("Scoring rules version mismatch");
  }
  const ruleIds = new Set<string>();
  for (const elementId of SEVEN_K_ELEMENT_IDS) {
    const element = SCORING_RULES.elements[elementId];
    if (
      !element ||
      element.elementId !== elementId ||
      element.levels.length !== 11 ||
      element.evidenceDimensions.length === 0 ||
      element.falseFriends.length === 0
    ) {
      throw new Error(`Invalid scoring rule set for ${elementId}`);
    }
    element.levels.forEach((level, score) => {
      if (level.score !== score || !level.criterion || ruleIds.has(level.ruleId)) {
        throw new Error(`Invalid scoring level ${elementId}:${score}`);
      }
      ruleIds.add(level.ruleId);
    });
  }
  if (
    SCORING_RULES.evaluationPolicy.mode !== "cumulative_capability" ||
    SCORING_RULES.evaluationPolicy.criterionRole !== "mandatory_core" ||
    SCORING_RULES.evaluationPolicy.supportingCoverageTargetPct !== 80
  ) {
    throw new Error("Invalid cumulative scoring policy");
  }
}

validateScoringRules();
