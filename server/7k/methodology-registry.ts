import { ARCHETYPES_RESOURCE_VERSION } from "./config/archetypes.v1";
import { ELEMENTS_RESOURCE_VERSION } from "./config/elements.v1";
import { MONEY_NOW_RESOURCE_VERSION } from "./config/money-now.v2.2";
import { TARGET_RULES_RESOURCE_VERSION } from "./config/target-rules.v2.1";
import { EVIDENCE_ROUTING_RESOURCE_VERSION } from "./config/evidence-routing.v3.0";
import { MONEY_NOW_HISTORY_MAP_RESOURCE_VERSION } from "./config/money-now-history-map.v2.2";
import { SCORING_RULES_RESOURCE_VERSION } from "./config/scoring-rules.v2.0";
import { TARGET_MODEL_DICTIONARY_RESOURCE_VERSION } from "./config/target-model-dictionary.v2.1";
import { P01_PROMPT_VERSION } from "./prompts/p01.v1.3";
import {
  TRANSITIONS_70_INTEGRITY,
  TRANSITIONS_70_RESOURCE,
  TRANSITIONS_RESOURCE_VERSION,
} from "./transition-resolver";

export const SEVEN_K_RESOURCE_VERSIONS = {
  elements: ELEMENTS_RESOURCE_VERSION,
  transitions: TRANSITIONS_RESOURCE_VERSION,
  archetypes: ARCHETYPES_RESOURCE_VERSION,
  targetRules: TARGET_RULES_RESOURCE_VERSION,
  moneyNow: MONEY_NOW_RESOURCE_VERSION,
} as const;

export type SevenKResourceVersions = typeof SEVEN_K_RESOURCE_VERSIONS;

export const SEVEN_K_METHODOLOGY_REGISTRY = {
  diagnosticInputSchema: "1.2",
  resources: SEVEN_K_RESOURCE_VERSIONS,
  transitionsSource: TRANSITIONS_70_RESOURCE.source,
  integrity: {
    transitions: TRANSITIONS_70_INTEGRITY,
  },
  aiModules: {
    p01: {
      promptVersion: P01_PROMPT_VERSION,
      outputSchemaVersion: "1.3",
      resources: {
        scoringRules: SCORING_RULES_RESOURCE_VERSION,
        evidenceRouting: EVIDENCE_ROUTING_RESOURCE_VERSION,
        targetModelDictionary: TARGET_MODEL_DICTIONARY_RESOURCE_VERSION,
        moneyNowHistoryMap: MONEY_NOW_HISTORY_MAP_RESOURCE_VERSION,
      },
    },
  },
  deterministicStages: {
    targetArchetype: {
      stageVersion: "target-archetype-stage.v1" as const,
      input: {
        p01PromptVersion: P01_PROMPT_VERSION,
        p01OutputSchemaVersion: "1.3" as const,
      },
      resources: {
        elements: ELEMENTS_RESOURCE_VERSION,
        targetRules: TARGET_RULES_RESOURCE_VERSION,
        archetypes: ARCHETYPES_RESOURCE_VERSION,
      },
    },
  },
} as const;

export function getSevenKResourceVersions(): SevenKResourceVersions {
  return { ...SEVEN_K_RESOURCE_VERSIONS };
}

export function getP01ResourceVersions() {
  return { ...SEVEN_K_METHODOLOGY_REGISTRY.aiModules.p01.resources };
}

export function getTargetArchetypeResourceVersions() {
  return {
    stageVersion:
      SEVEN_K_METHODOLOGY_REGISTRY.deterministicStages.targetArchetype.stageVersion,
    p01PromptVersion:
      SEVEN_K_METHODOLOGY_REGISTRY.deterministicStages.targetArchetype.input.p01PromptVersion,
    p01OutputSchemaVersion:
      SEVEN_K_METHODOLOGY_REGISTRY.deterministicStages.targetArchetype.input
        .p01OutputSchemaVersion,
    ...SEVEN_K_METHODOLOGY_REGISTRY.deterministicStages.targetArchetype.resources,
  };
}
