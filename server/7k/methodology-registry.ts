import { ARCHETYPES_RESOURCE_VERSION } from "./config/archetypes.v1";
import { ELEMENTS_RESOURCE_VERSION } from "./config/elements.v1";
import { MONEY_NOW_RESOURCE_VERSION } from "./config/money-now.v2.2";
import { TARGET_RULES_RESOURCE_VERSION } from "./config/target-rules.v2.1";
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
} as const;

export function getSevenKResourceVersions(): SevenKResourceVersions {
  return { ...SEVEN_K_RESOURCE_VERSIONS };
}
