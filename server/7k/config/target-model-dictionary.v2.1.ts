import {
  BASE_MODEL_FAMILIES,
  CAPABILITY_FLOORS,
  DESIRED_OWNER_ROLES,
  MODEL_FAMILIES,
  TARGET_MODIFIER_FLOORS,
} from "./target-rules.v2.1";

export const TARGET_MODEL_DICTIONARY_RESOURCE_VERSION =
  "target-model-dictionary.v2.1" as const;

export const TARGET_MODEL_DICTIONARY = {
  version: TARGET_MODEL_DICTIONARY_RESOURCE_VERSION,
  modelFamilies: MODEL_FAMILIES,
  baseModelFamilies: BASE_MODEL_FAMILIES,
  capabilityCodes: Object.keys(CAPABILITY_FLOORS),
  targetModifierCodes: Object.keys(TARGET_MODIFIER_FLOORS),
  capabilityDefinitions: Object.fromEntries(
    Object.entries(CAPABILITY_FLOORS).map(([code, definition]) => [
      code,
      { code, elementId: definition.elementId, whenRequired: definition.whenRequired },
    ]),
  ),
  targetModifierDefinitions: Object.fromEntries(
    Object.entries(TARGET_MODIFIER_FLOORS).map(([code, definition]) => [
      code,
      { code, description: definition.description },
    ]),
  ),
  desiredOwnerRoles: DESIRED_OWNER_ROLES,
} as const;

export const TARGET_RULE_CODE_SET = new Set<string>([
  ...TARGET_MODEL_DICTIONARY.capabilityCodes,
  ...TARGET_MODEL_DICTIONARY.targetModifierCodes,
]);
