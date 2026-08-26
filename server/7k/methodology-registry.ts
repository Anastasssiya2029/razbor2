import { ARCHETYPES_RESOURCE_VERSION } from "./config/archetypes.v1";
import { ELEMENTS_RESOURCE_VERSION } from "./config/elements.v1";
import { MONEY_NOW_RESOURCE_VERSION } from "./config/money-now.v2.2";
import { TARGET_RULES_RESOURCE_VERSION } from "./config/target-rules.v2.2";
import { EVIDENCE_ROUTING_RESOURCE_VERSION } from "./config/evidence-routing.v3.0";
import { MONEY_NOW_HISTORY_MAP_RESOURCE_VERSION } from "./config/money-now-history-map.v2.2";
import { MONEY_NOW_FACT_EXTRACTION_VERSION } from "./config/money-now-fact-extraction.v1";
import { MONEY_NOW_SELECTOR_CONTRACT_VERSION } from "./config/money-now-selector-contract.v1";
import { SCORING_RULES_RESOURCE_VERSION } from "./config/scoring-rules.v2.0";
import { TARGET_MODEL_DICTIONARY_RESOURCE_VERSION } from "./config/target-model-dictionary.v2.2";
import { P01_PROMPT_VERSION } from "./prompts/p01.v1.4";
import { P02_PROMPT_VERSION } from "./prompts/p02.v1.3";
import { P03_PROMPT_SHA256, P03_PROMPT_VERSION } from "./prompts/p03.v1.5";
import { P04_PROMPT_SHA256, P04_PROMPT_VERSION } from "./prompts/p04.v1.2";
import { REPORT_GLOSSARY_VERSION } from "./config/report-glossary.v1";
import {
  MONEY_NOW_PRESCRIPTION_INTEGRITY,
  MONEY_NOW_PRESCRIPTION_METHODOLOGY_VERSION,
  MONEY_NOW_PRESCRIPTION_RULES_VERSION,
} from "./config/money-now-prescription-rules.v1";
import {
  CONSTRAINT_RULES_RESOURCE_VERSION,
  DEPENDENCY_RULES_RESOURCE_VERSION,
  LEVEL_CAPABILITIES_RESOURCE_VERSION,
} from "./config/p02-strategy-rules.v2.1";
import {
  TRANSITIONS_70_INTEGRITY,
  TRANSITIONS_70_RESOURCE,
  TRANSITION_LEVERS_RESOURCE_VERSION,
  TRANSITIONS_RESOURCE_VERSION,
} from "./transition-resolver";
import {
  MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256,
  MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256,
  MONEY_NOW_SELECTOR_STAGE_VERSION,
} from "../money-now-selector/types";

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
    moneyNowPrescription: MONEY_NOW_PRESCRIPTION_INTEGRITY,
  },
  aiModules: {
    p01: {
      promptVersion: P01_PROMPT_VERSION,
      requestBuilder: "p01-request-builder.v2.2" as const,
      outputSchemaVersion: "1.4",
      resources: {
        scoringRules: SCORING_RULES_RESOURCE_VERSION,
        evidenceRouting: EVIDENCE_ROUTING_RESOURCE_VERSION,
        targetModelDictionary: TARGET_MODEL_DICTIONARY_RESOURCE_VERSION,
        moneyNowHistoryMap: MONEY_NOW_HISTORY_MAP_RESOURCE_VERSION,
        moneyNowFactExtraction: MONEY_NOW_FACT_EXTRACTION_VERSION,
      },
    },
    p02: {
      promptVersion: P02_PROMPT_VERSION,
      requestBuilder: "p02-request-builder.v2.1" as const,
      outputSchemaVersion: "1.3" as const,
      input: {
        p01PromptVersion: P01_PROMPT_VERSION,
        p01OutputSchemaVersion: "1.4" as const,
        targetRules: TARGET_RULES_RESOURCE_VERSION,
      },
      resources: {
        elements: ELEMENTS_RESOURCE_VERSION,
        levelCapabilities: LEVEL_CAPABILITIES_RESOURCE_VERSION,
        constraintRules: CONSTRAINT_RULES_RESOURCE_VERSION,
        dependencyRules: DEPENDENCY_RULES_RESOURCE_VERSION,
        targetRules: TARGET_RULES_RESOURCE_VERSION,
        transitionLevers: TRANSITION_LEVERS_RESOURCE_VERSION,
      },
    },
    p03: {
      promptVersion: P03_PROMPT_VERSION,
      promptSha256: P03_PROMPT_SHA256,
      outputSchemaVersion: "1.5" as const,
      input: {
        p01PromptVersion: P01_PROMPT_VERSION,
        p01OutputSchemaVersion: "1.4" as const,
        selectorContract: MONEY_NOW_SELECTOR_CONTRACT_VERSION,
        selectorMethodology: MONEY_NOW_RESOURCE_VERSION,
      },
      resources: {
        prescriptionMethodology: MONEY_NOW_PRESCRIPTION_METHODOLOGY_VERSION,
        prescriptionRules: MONEY_NOW_PRESCRIPTION_RULES_VERSION,
        factExtraction: MONEY_NOW_FACT_EXTRACTION_VERSION,
      },
    },
    p04: {
      promptVersion: P04_PROMPT_VERSION,
      requestBuilder: "p04-request-builder.v2" as const,
      promptSha256: P04_PROMPT_SHA256,
      outputSchemaVersion: "1.2" as const,
      input: {
        p01PromptVersion: P01_PROMPT_VERSION,
        p01OutputSchemaVersion: "1.4" as const,
        p02PromptVersion: P02_PROMPT_VERSION,
        p02OutputSchemaVersion: "1.3" as const,
        p03PromptVersion: P03_PROMPT_VERSION,
        p03OutputSchemaVersion: "1.5" as const,
        taskResolverStageVersion: "task-resolver-stage.v1" as const,
        moneyNowSelectorStageVersion: MONEY_NOW_SELECTOR_STAGE_VERSION,
      },
      resources: {
        elements: ELEMENTS_RESOURCE_VERSION,
        targetRules: TARGET_RULES_RESOURCE_VERSION,
        archetypes: ARCHETYPES_RESOURCE_VERSION,
        transitions: TRANSITIONS_RESOURCE_VERSION,
        selectorContract: MONEY_NOW_SELECTOR_CONTRACT_VERSION,
        reportPolicy: "p04-report-policy.v1" as const,
        sourceRegistry: "p04-source-registry.v1" as const,
        reportGlossary: REPORT_GLOSSARY_VERSION,
      },
    },
  },
  deterministicStages: {
    targetArchetype: {
      stageVersion: "target-archetype-stage.v1" as const,
      input: {
        p01PromptVersion: P01_PROMPT_VERSION,
        p01OutputSchemaVersion: "1.4" as const,
      },
      resources: {
        elements: ELEMENTS_RESOURCE_VERSION,
        targetRules: TARGET_RULES_RESOURCE_VERSION,
        archetypes: ARCHETYPES_RESOURCE_VERSION,
      },
    },
    taskResolver: {
      stageVersion: "task-resolver-stage.v1" as const,
      input: {
        p02PromptVersion: P02_PROMPT_VERSION,
        p02OutputSchemaVersion: "1.3" as const,
        targetRules: TARGET_RULES_RESOURCE_VERSION,
      },
      resources: {
        transitions: TRANSITIONS_RESOURCE_VERSION,
      },
    },
    moneyNowSelector: {
      stageVersion: MONEY_NOW_SELECTOR_STAGE_VERSION,
      input: {
        p01PromptVersion: P01_PROMPT_VERSION,
        p01OutputSchemaVersion: "1.4" as const,
        taskResolverStageVersion: "task-resolver-stage.v1" as const,
      },
      resources: {
        selectorContract: MONEY_NOW_SELECTOR_CONTRACT_VERSION,
        selectorContractJsonSha256: MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256,
        selectorContractTsSha256: MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256,
        businessMethodology: MONEY_NOW_RESOURCE_VERSION,
        factExtraction: MONEY_NOW_FACT_EXTRACTION_VERSION,
      },
    },
    finalAnalysisResult: {
      stageVersion: "analysis-result-assembler.v1" as const,
      outputSchemaVersion: "analysis-result.v1" as const,
      methodologyVersion: "7k.v1.2" as const,
      input: {
        p01PromptVersion: P01_PROMPT_VERSION,
        p01OutputSchemaVersion: "1.4" as const,
        targetStageVersion: "target-archetype-stage.v1" as const,
        p02PromptVersion: P02_PROMPT_VERSION,
        p02OutputSchemaVersion: "1.3" as const,
        taskResolverStageVersion: "task-resolver-stage.v1" as const,
        moneyNowSelectorStageVersion: MONEY_NOW_SELECTOR_STAGE_VERSION,
        p03PromptVersion: P03_PROMPT_VERSION,
        p03OutputSchemaVersion: "1.5" as const,
        p04PromptVersion: P04_PROMPT_VERSION,
        p04OutputSchemaVersion: "1.2" as const,
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

export function getP02ResourceVersions() {
  return { ...SEVEN_K_METHODOLOGY_REGISTRY.aiModules.p02.resources };
}
