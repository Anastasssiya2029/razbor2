import {
  BASE_MODEL_FAMILIES,
  CAPABILITY_FLOORS,
  DELEGATION_MATURITY_LADDER,
  DESIRED_OWNER_ROLES,
  MODEL_FAMILIES,
  NEXT_LEVEL_TARGET_POLICY,
  TARGET_MODIFIER_FLOORS,
} from "./target-rules.v2.2";

export const TARGET_MODEL_DICTIONARY_RESOURCE_VERSION =
  "target-model-dictionary.v2.2" as const;

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
  nextLevelTargetPolicy: NEXT_LEVEL_TARGET_POLICY,
  delegationMaturityLadder: DELEGATION_MATURITY_LADDER,
  desiredOwnerRoles: DESIRED_OWNER_ROLES,
} as const;

/**
 * Fail-closed text rules for model families that have an unambiguous phrase in
 * the approved Anna/Alina golden cases. They are a backend fallback only: when
 * more than one family matches, no family is selected.
 */
export const TARGET_MODEL_TEXT_RULES = [
  {
    modelFamily: "package_1to1",
    requiredAny: ["1:1", "индивидуальная программа сопровождения"],
    forbiddenAny: ["премиум", "premium", "vip", "вип"],
  },
  {
    modelFamily: "autoproduct",
    requiredAny: ["продукт в записи", "автопродукт"],
    forbiddenAny: [],
  },
] as const satisfies readonly {
  modelFamily: (typeof BASE_MODEL_FAMILIES)[number];
  requiredAny: readonly string[];
  forbiddenAny: readonly string[];
}[];

export const TARGET_RULE_CODE_SET = new Set<string>([
  ...TARGET_MODEL_DICTIONARY.capabilityCodes,
  ...TARGET_MODEL_DICTIONARY.targetModifierCodes,
]);
