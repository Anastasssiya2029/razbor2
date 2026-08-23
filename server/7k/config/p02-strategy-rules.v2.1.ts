import { SCORING_RULES, SCORING_RULES_RESOURCE_VERSION } from "./scoring-rules.v2.0";
import { SEVEN_K_ELEMENT_IDS, type SevenKScores } from "../types";
import {
  TRANSITIONS_70,
  TRANSITION_LEVERS_RESOURCE_VERSION,
} from "../transition-resolver";

export const CONSTRAINT_RULES_RESOURCE_VERSION = "constraint-rules.v2.1" as const;
export const DEPENDENCY_RULES_RESOURCE_VERSION = "dependency-rules.v2.1" as const;
export const LEVEL_CAPABILITIES_RESOURCE_VERSION = SCORING_RULES_RESOURCE_VERSION;

const TRANSITION_BY_LEVEL = new Map(
  TRANSITIONS_70.map((transition) => [
    `${transition.element_id}:${transition.from_score}`,
    transition,
  ]),
);

function transitionLever(elementId: (typeof SEVEN_K_ELEMENT_IDS)[number], fromScore: number) {
  const transition = TRANSITION_BY_LEVEL.get(`${elementId}:${fromScore}`);
  if (!transition) {
    throw new Error(`Missing transition lever for ${elementId} ${fromScore}→${fromScore + 1}.`);
  }
  return {
    from_score: transition.from_score,
    to_score: transition.to_score,
    revenue_lever: transition.revenue_lever,
    revenue_mechanism: transition.revenue_mechanism,
  };
}

export const TRANSITION_LEVER_POLICY = {
  role: "causal_hint_for_business_effect_and_fastest_test",
  mayInform: ["unlock_effect", "fastest_business_test", "milestone_why_now"],
  mustNotOverride: [
    "persisted_evidence",
    "dependency_precedence",
    "target_necessity",
    "founder_model_fit",
  ],
  isRevenuePromise: false,
  taskTextAvailableToP02: false,
} as const;

export function projectTransitionLevers(currentScores: SevenKScores, targetScores: SevenKScores) {
  return {
    version: TRANSITION_LEVERS_RESOURCE_VERSION,
    policy: TRANSITION_LEVER_POLICY,
    elements: Object.fromEntries(
      SEVEN_K_ELEMENT_IDS.map((elementId) => [
        elementId,
        Array.from(
          { length: Math.max(0, targetScores[elementId] - currentScores[elementId]) },
          (_, offset) => transitionLever(elementId, currentScores[elementId] + offset),
        ),
      ]),
    ),
  } as const;
}

export const CONSTRAINT_RULES = {
  version: CONSTRAINT_RULES_RESOURCE_VERSION,
  lenses: ["current_business_mechanism", "target_capability_chain"],
  stages: [
    "opportunities", "interest", "next_step", "offer", "payment", "continuation",
    "referral", "capacity", "system_repeatability", "model_fit",
  ],
  types: [
    "demand_shortage", "path_break", "low_monetization", "weak_product_economics",
    "low_retention", "owner_capacity", "founder_model_misfit", "fragmented_system",
    "owner_dependency",
  ],
  rootTests: [
    "direct_causality", "evidence_over_self_report", "target_necessity",
    "dependency_precedence", "unlock_effect", "fast_business_test", "founder_model_fit",
  ],
  tieBreaker: [
    "founder_model_fit_filter", "dependency_precedence", "direct_causality",
    "target_necessity", "evidence_strength", "unlock_effect", "fastest_business_test",
    "stable_dependency_fallback",
  ],
  bundle: { priority: 1, buildMaximum: 2, partitionAllElementsExactlyOnce: true },
  milestone: { intermediateOnly: true, checkpointRequired: true, continueAutomatically: false },
  previousAttempts: {
    requireNewMaterialConditionForRepeatedRoute: true,
    blockCode: "REPEATED_SOLUTION_WITHOUT_NEW_CONDITION",
  },
  targetConsistency: {
    canonicalOwnerRoleSource: "TARGET_CONFIG.desiredOwnerRole",
    softRoleSource: "P01_STRATEGY_CONTEXT.desiredRoleSummary",
    conflictCode: "TARGET_CONFIG_INCONSISTENCY",
  },
} as const;

export const DEPENDENCY_RULES = {
  version: DEPENDENCY_RULES_RESOURCE_VERSION,
  graphType: "dependency_map_not_linear_ladder",
  baselineEdges: [
    ["authenticity", "audience"],
    ["audience", "product_method"],
    ["product_method", "sales_technology"],
    ["sales_technology", "funnel"],
    ["funnel", "blog"],
    ["funnel", "team"],
  ],
  rules: [
    "preserve_working_later_elements",
    "blog_only_when_target_requires_it",
    "team_when_capacity_or_owner_dependency_requires_it",
    "product_precedes_sales_when_offer_is_not_clear",
    "audience_or_funnel_precedes_sales_when_meetings_are_not_targeted",
  ],
} as const;

export const LEVEL_CAPABILITIES = {
  version: LEVEL_CAPABILITIES_RESOURCE_VERSION,
  elements: Object.fromEntries(
    SEVEN_K_ELEMENT_IDS.map((elementId) => [
      elementId,
      SCORING_RULES.elements[elementId].levels.map((level) => ({
        score: level.score,
        ruleId: level.ruleId,
        capability: level.criterion,
        nextLevelGate: level.nextLevelGate,
      })),
    ]),
  ),
} as const;
