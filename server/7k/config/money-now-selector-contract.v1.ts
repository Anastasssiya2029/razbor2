import contractJson from "./money-now-selector-contract.v1.json";
import {
  MONEY_NOW_FACT_CODES,
  MONEY_NOW_FACT_DEFINITIONS,
  MONEY_NOW_FACT_EVIDENCE_POLICIES,
  MONEY_NOW_MATERIAL_CONDITION_CODES,
  type MoneyNowFactCode,
  type MoneyNowFactConfidence,
  type MoneyNowFactState,
  type MoneyNowMaterialConditionCode,
} from "./money-now-fact-extraction.v1";
import {
  MONEY_NOW_SCENARIO_IDS,
  type MoneyNowScenarioId,
} from "./money-now.v2.2";

export {
  MONEY_NOW_FACT_CODES,
  MONEY_NOW_FACT_DEFINITIONS,
  MONEY_NOW_MATERIAL_CONDITION_CODES,
};
export type {
  MoneyNowFactCode,
  MoneyNowFactConfidence,
  MoneyNowFactState,
  MoneyNowMaterialConditionCode,
};

export const MONEY_NOW_SELECTOR_CONTRACT_VERSION =
  "money-now-selector-contract.v1.2" as const;
export const MONEY_NOW_PROOF_MAP_VERSION = "money-now-proof-map.v1" as const;

export type MoneyNowCapacityMode =
  | "requires_additional_delivery"
  | "uses_existing_flow"
  | "capacity_neutral";
export type MoneyNowCapacityFit = "fit" | "risk" | "no_fit";
export type MoneyNowModelFit = "fit";

type CapacityFactCode = "HAS_UNUSED_CAPACITY" | "CURRENT_OVERLOAD";
export type MoneyNowCapacityFitRule =
  | {
      when: Partial<Record<CapacityFactCode, MoneyNowFactState>>;
      result: MoneyNowCapacityFit;
    }
  | { otherwise: true; result: MoneyNowCapacityFit };

export type MoneyNowSelectorContract = {
  version: typeof MONEY_NOW_SELECTOR_CONTRACT_VERSION;
  businessMethodologyVersion: "money-now.v2.2";
  factStateEnum: MoneyNowFactState[];
  factConfidenceEnum: MoneyNowFactConfidence[];
  proofLevelMapping: Record<MoneyNowFactConfidence, 1 | 2 | 3>;
  scenarioProofLevelRule: string;
  eligibilityRule: string;
  facts: Array<{ code: MoneyNowFactCode; definition: string }>;
  scenarioRequiredFacts: Record<MoneyNowScenarioId, MoneyNowFactCode[]>;
  capacityModes: Record<MoneyNowScenarioId, MoneyNowCapacityMode>;
  capacityFitRules: Record<MoneyNowCapacityMode, MoneyNowCapacityFitRule[]>;
  modelFitRule: string;
  historyStatusEnum: Array<
    | "not_reported"
    | "worked_sustained"
    | "worked_temporarily"
    | "tried_no_sustained_result"
    | "unclear"
  >;
  newMaterialConditionEnum: Array<"yes" | "no" | "unknown" | "not_applicable">;
  materialConditionPrimaryCodesByScenario: Record<
    MoneyNowScenarioId,
    MoneyNowMaterialConditionCode[]
  >;
  materialConditionFactCodes: Record<
    MoneyNowMaterialConditionCode,
    MoneyNowFactCode[]
  >;
  materialConditionSupportingCodes: MoneyNowMaterialConditionCode[];
  materialConditionRule: string;
  noEligibleStageStatus: "no_eligible_scenario";
  notes: string[];
};

const CAPACITY_MODES = [
  "requires_additional_delivery",
  "uses_existing_flow",
  "capacity_neutral",
] as const satisfies readonly MoneyNowCapacityMode[];
const CAPACITY_FITS = ["fit", "risk", "no_fit"] as const;
const CAPACITY_FACT_CODES = [
  "HAS_UNUSED_CAPACITY",
  "CURRENT_OVERLOAD",
] as const satisfies readonly CapacityFactCode[];
const FACT_STATES = [
  "confirmed_true",
  "confirmed_false",
  "unknown",
] as const satisfies readonly MoneyNowFactState[];
const FACT_CONFIDENCES = [
  "high",
  "medium",
  "low",
] as const satisfies readonly MoneyNowFactConfidence[];

const rawContract = contractJson as MoneyNowSelectorContract;

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  if (
    actual.length !== canonical.length ||
    actual.some((key, index) => key !== canonical[index])
  ) {
    throw new Error(`${label} must contain exactly: ${canonical.join(", ")}.`);
  }
}

export function assertMoneyNowSelectorContractIntegrity(
  contract: MoneyNowSelectorContract = rawContract,
): void {
  if (contract.version !== MONEY_NOW_SELECTOR_CONTRACT_VERSION) {
    throw new Error("Money Now selector contract version mismatch.");
  }

  const factCodes = contract.facts.map((fact) => fact.code);
  if (
    factCodes.length !== MONEY_NOW_FACT_CODES.length ||
    new Set(factCodes).size !== MONEY_NOW_FACT_CODES.length ||
    MONEY_NOW_FACT_CODES.some((code) => !factCodes.includes(code))
  ) {
    throw new Error("Money Now selector contract must contain exactly 44 unique facts.");
  }
  assertExactKeys(
    MONEY_NOW_FACT_EVIDENCE_POLICIES,
    MONEY_NOW_FACT_CODES,
    "Money Now evidencePolicy registry",
  );

  assertExactKeys(
    contract.proofLevelMapping,
    FACT_CONFIDENCES,
    "Money Now proof mapping",
  );
  if (
    contract.proofLevelMapping.high !== 3 ||
    contract.proofLevelMapping.medium !== 2 ||
    contract.proofLevelMapping.low !== 1
  ) {
    throw new Error("Money Now proof mapping must be high=3, medium=2, low=1.");
  }

  assertExactKeys(
    contract.scenarioRequiredFacts,
    MONEY_NOW_SCENARIO_IDS,
    "Money Now prerequisite registry",
  );
  assertExactKeys(
    contract.capacityModes,
    MONEY_NOW_SCENARIO_IDS,
    "Money Now capacity-mode registry",
  );
  assertExactKeys(
    contract.materialConditionPrimaryCodesByScenario,
    MONEY_NOW_SCENARIO_IDS,
    "Money Now primary-condition registry",
  );

  const factCodeSet = new Set<string>(MONEY_NOW_FACT_CODES);
  const materialCodeSet = new Set<string>(MONEY_NOW_MATERIAL_CONDITION_CODES);
  for (const scenarioId of MONEY_NOW_SCENARIO_IDS) {
    const requiredFacts = contract.scenarioRequiredFacts[scenarioId];
    if (!requiredFacts?.length) {
      throw new Error(`Missing Money Now prerequisites for ${scenarioId}.`);
    }
    for (const factCode of requiredFacts) {
      if (!factCodeSet.has(factCode)) {
        throw new Error(`Unknown prerequisite fact ${factCode} for ${scenarioId}.`);
      }
    }

    const capacityMode = contract.capacityModes[scenarioId];
    if (!CAPACITY_MODES.includes(capacityMode)) {
      throw new Error(`Unknown capacity mode ${capacityMode} for ${scenarioId}.`);
    }

    const primaryCodes = contract.materialConditionPrimaryCodesByScenario[scenarioId];
    if (!primaryCodes?.length) {
      throw new Error(`Missing Money Now material-condition codes for ${scenarioId}.`);
    }
    for (const conditionCode of primaryCodes) {
      if (!materialCodeSet.has(conditionCode)) {
        throw new Error(`Unknown primary material-condition code ${conditionCode}.`);
      }
    }
  }

  assertExactKeys(
    contract.capacityFitRules,
    CAPACITY_MODES,
    "Money Now capacity-fit rules",
  );
  for (const mode of CAPACITY_MODES) {
    const rules = contract.capacityFitRules[mode];
    if (!Array.isArray(rules) || rules.length === 0) {
      throw new Error(`Missing ordered capacity-fit rules for ${mode}.`);
    }
    let otherwiseCount = 0;
    rules.forEach((rule, index) => {
      if (!CAPACITY_FITS.includes(rule.result)) {
        throw new Error(`Unknown capacity-fit result in ${mode}.`);
      }
      if ("otherwise" in rule) {
        otherwiseCount += 1;
        if (rule.otherwise !== true || index !== rules.length - 1) {
          throw new Error(`Capacity fallback for ${mode} must be the final ordered rule.`);
        }
        return;
      }
      const predicates = Object.entries(rule.when);
      if (predicates.length === 0) {
        throw new Error(`Capacity predicate for ${mode} cannot be empty.`);
      }
      for (const [factCode, state] of predicates) {
        if (!CAPACITY_FACT_CODES.includes(factCode as CapacityFactCode)) {
          throw new Error(`Unknown capacity predicate fact ${factCode}.`);
        }
        if (!FACT_STATES.includes(state as MoneyNowFactState)) {
          throw new Error(`Unknown capacity predicate state ${state}.`);
        }
      }
    });
    if (otherwiseCount !== 1) {
      throw new Error(`Capacity rules for ${mode} require exactly one fallback.`);
    }
  }

  assertExactKeys(
    contract.materialConditionFactCodes,
    MONEY_NOW_MATERIAL_CONDITION_CODES,
    "Money Now material-condition fact mapping",
  );
  for (const [conditionCode, mappedFacts] of Object.entries(
    contract.materialConditionFactCodes,
  )) {
    if (!materialCodeSet.has(conditionCode)) {
      throw new Error(`Unknown material-condition mapping key ${conditionCode}.`);
    }
    for (const factCode of mappedFacts) {
      if (!factCodeSet.has(factCode)) {
        throw new Error(
          `Unknown fact ${factCode} in material-condition mapping ${conditionCode}.`,
        );
      }
    }
  }
}

assertMoneyNowSelectorContractIntegrity();

export const MONEY_NOW_SELECTOR_CONTRACT = rawContract as Readonly<MoneyNowSelectorContract>;

export const MONEY_NOW_SCENARIO_REQUIRED_FACTS =
  rawContract.scenarioRequiredFacts as Readonly<
    Record<MoneyNowScenarioId, readonly MoneyNowFactCode[]>
  >;

export const MONEY_NOW_CAPACITY_MODES = rawContract.capacityModes as Readonly<
  Record<MoneyNowScenarioId, MoneyNowCapacityMode>
>;

export const MONEY_NOW_CAPACITY_FIT_RULES = rawContract.capacityFitRules as Readonly<
  Record<MoneyNowCapacityMode, readonly MoneyNowCapacityFitRule[]>
>;

export const MONEY_NOW_MATERIAL_CONDITION_PRIMARY_CODES =
  rawContract.materialConditionPrimaryCodesByScenario as Readonly<
    Record<MoneyNowScenarioId, readonly MoneyNowMaterialConditionCode[]>
  >;

export const MONEY_NOW_MATERIAL_CONDITION_FACT_CODES =
  rawContract.materialConditionFactCodes as Readonly<
    Record<MoneyNowMaterialConditionCode, readonly MoneyNowFactCode[]>
  >;

export const MONEY_NOW_MATERIAL_CONDITION_SUPPORTING_CODES =
  rawContract.materialConditionSupportingCodes as readonly MoneyNowMaterialConditionCode[];

export const MONEY_NOW_PROOF_LEVEL_BY_CONFIDENCE = Object.freeze({
  ...rawContract.proofLevelMapping,
}) as Readonly<Record<MoneyNowFactConfidence, 1 | 2 | 3>>;

export function moneyNowProofLevel(
  confidence: MoneyNowFactConfidence,
): 1 | 2 | 3 {
  return MONEY_NOW_PROOF_LEVEL_BY_CONFIDENCE[confidence];
}

export const MONEY_NOW_MODEL_FIT_DEFAULT: MoneyNowModelFit = "fit";

function capacityRuleMatches(
  rule: Extract<MoneyNowCapacityFitRule, { when: unknown }>,
  facts: Pick<
    Record<MoneyNowFactCode, { state: MoneyNowFactState }>,
    CapacityFactCode
  >,
): boolean {
  return Object.entries(rule.when).every(
    ([factCode, state]) =>
      facts[factCode as CapacityFactCode].state === state,
  );
}

export function evaluateMoneyNowCapacityFit(
  scenarioId: MoneyNowScenarioId,
  facts: Pick<
    Record<MoneyNowFactCode, { state: MoneyNowFactState }>,
    CapacityFactCode
  >,
): MoneyNowCapacityFit {
  const mode = MONEY_NOW_CAPACITY_MODES[scenarioId];
  for (const rule of MONEY_NOW_CAPACITY_FIT_RULES[mode]) {
    if ("otherwise" in rule || capacityRuleMatches(rule, facts)) {
      return rule.result;
    }
  }
  throw new Error(`No capacity-fit rule matched mode ${mode}.`);
}
