import contractJson from "./money-now-selector-contract.v1.json";
import {
  MONEY_NOW_SCENARIO_IDS,
  type MoneyNowScenarioId,
} from "./money-now.v2.2";

export const MONEY_NOW_SELECTOR_CONTRACT_VERSION =
  "money-now-selector-contract.v1" as const;
export const MONEY_NOW_PROOF_MAP_VERSION = "money-now-proof-map.v1" as const;

export const MONEY_NOW_FACT_CODES = [
  "HAS_CURRENT_CLIENTS",
  "HAS_FORMER_CLIENTS",
  "HAS_WARM_LEADS",
  "HAS_SOCIAL_AUDIENCE",
  "HAS_WARM_NETWORK",
  "HAS_PARTNERS",
  "HAS_UNUSED_CAPACITY",
  "CURRENT_OVERLOAD",
  "CURRENT_RESULT_CONFIRMED",
  "CLIENT_SATISFACTION_CONFIRMED",
  "LOGICAL_CONTINUATION_EXISTS",
  "CONTINUATION_OBJECTIVELY_NEEDED",
  "NEXT_PRODUCT_OR_ADDITIONAL_TASK_EXISTS",
  "ONE_OFF_CLIENT_WORK_EXISTS",
  "REPEATED_WORK_PATTERN_EXISTS",
  "FULLER_RESULT_PATH_EXISTS",
  "FORMER_CLIENT_NEED_RELEVANT_NOW",
  "WARM_LEAD_RECONTACT_COMPATIBLE",
  "REFERRAL_APPROPRIATE",
  "WARM_NETWORK_TARGET_ACCESS",
  "PRIORITY_SEGMENT_IDENTIFIED",
  "CONCRETE_PRODUCT_OFFER_EXISTS",
  "DIRECT_OFFER_UNDERUSED",
  "PARTNER_TARGET_ACCESS",
  "BEST_PERIOD_PAYMENTS_CONFIRMED",
  "BEST_PERIOD_MECHANISM_IDENTIFIED",
  "BEST_PERIOD_REPRODUCIBLE_NOW",
  "PROVEN_CHANNEL_PAYMENTS_CONFIRMED",
  "PROVEN_CHANNEL_CURRENTLY_INACTIVE",
  "PROVEN_CHANNEL_REACTIVATABLE_NOW",
  "PROVEN_EVENT_PAYMENTS_CONFIRMED",
  "PROVEN_EVENT_REPRODUCIBLE_NOW",
  "INTEREST_EXISTS",
  "NEXT_STEP_LEAK_CONFIRMED",
  "AUDIENCE_FIT_CONFIRMED",
  "PRODUCT_CLARITY_CONFIRMED",
  "MEETINGS_OR_OFFERS_EXIST",
  "PAYMENT_LEAK_CONFIRMED",
  "DEMAND_CONFIRMED",
  "PRICE_LIMITS_ECONOMICS_CONFIRMED",
  "VALUE_COMMUNICATION_CONFIRMED",
  "FULL_WORKING_PATH_CONFIRMED",
  "CURRENT_MECHANISM_REPEATABLE",
  "PAID_TRAFFIC_PROVEN",
] as const;

export type MoneyNowFactCode = (typeof MONEY_NOW_FACT_CODES)[number];
export type MoneyNowFactState =
  | "confirmed_true"
  | "confirmed_false"
  | "unknown";
export type MoneyNowFactConfidence = "high" | "medium" | "low";
export type MoneyNowCapacityMode =
  | "requires_additional_delivery"
  | "uses_existing_flow"
  | "capacity_neutral";
export type MoneyNowCapacityFit = "fit" | "risk" | "no_fit";
export type MoneyNowModelFit = "fit";

export const MONEY_NOW_MATERIAL_CONDITION_CODES = [
  "AUDIENCE",
  "PRODUCT",
  "QUALIFICATION",
  "SALES_TECHNOLOGY",
  "SEQUENCE",
  "CAPACITY",
  "CHANNEL_CONTEXT",
  "OFFER",
  "PRICE",
  "TEAM",
  "OTHER_PREREQUISITE",
] as const;
export type MoneyNowMaterialConditionCode =
  (typeof MONEY_NOW_MATERIAL_CONDITION_CODES)[number];

type RawContract = {
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
  capacityFitRules: Record<MoneyNowCapacityMode, Record<string, MoneyNowCapacityFit>>;
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
  materialConditionSupportingCodes: MoneyNowMaterialConditionCode[];
  materialConditionRule: string;
  noEligibleStageStatus: "no_eligible_scenario";
  notes: string[];
};

const rawContract = contractJson as RawContract;

function assertContractIntegrity(): void {
  if (rawContract.version !== MONEY_NOW_SELECTOR_CONTRACT_VERSION) {
    throw new Error("Money Now selector contract version mismatch.");
  }
  const factCodes = rawContract.facts.map((fact) => fact.code);
  if (
    factCodes.length !== MONEY_NOW_FACT_CODES.length ||
    new Set(factCodes).size !== MONEY_NOW_FACT_CODES.length ||
    MONEY_NOW_FACT_CODES.some((code) => !factCodes.includes(code))
  ) {
    throw new Error("Money Now selector contract must contain exactly 44 unique facts.");
  }
  for (const scenarioId of MONEY_NOW_SCENARIO_IDS) {
    if (!rawContract.scenarioRequiredFacts[scenarioId]?.length) {
      throw new Error(`Missing Money Now prerequisites for ${scenarioId}.`);
    }
    if (!rawContract.capacityModes[scenarioId]) {
      throw new Error(`Missing Money Now capacity mode for ${scenarioId}.`);
    }
    if (!rawContract.materialConditionPrimaryCodesByScenario[scenarioId]?.length) {
      throw new Error(`Missing Money Now material-condition codes for ${scenarioId}.`);
    }
  }
}

assertContractIntegrity();

export const MONEY_NOW_FACT_DEFINITIONS = Object.fromEntries(
  rawContract.facts.map((fact) => [fact.code, fact.definition]),
) as Record<MoneyNowFactCode, string>;

export const MONEY_NOW_SCENARIO_REQUIRED_FACTS =
  rawContract.scenarioRequiredFacts as Readonly<
    Record<MoneyNowScenarioId, readonly MoneyNowFactCode[]>
  >;

export const MONEY_NOW_CAPACITY_MODES = rawContract.capacityModes as Readonly<
  Record<MoneyNowScenarioId, MoneyNowCapacityMode>
>;

export const MONEY_NOW_CAPACITY_FIT_RULES = rawContract.capacityFitRules as Readonly<
  Record<MoneyNowCapacityMode, Readonly<Record<string, MoneyNowCapacityFit>>>
>;

export const MONEY_NOW_MATERIAL_CONDITION_PRIMARY_CODES =
  rawContract.materialConditionPrimaryCodesByScenario as Readonly<
    Record<MoneyNowScenarioId, readonly MoneyNowMaterialConditionCode[]>
  >;

export const MONEY_NOW_MATERIAL_CONDITION_SUPPORTING_CODES =
  rawContract.materialConditionSupportingCodes as readonly MoneyNowMaterialConditionCode[];

export const MONEY_NOW_PROOF_LEVEL_BY_CONFIDENCE = Object.freeze({
  high: 3,
  medium: 2,
  low: 1,
} as const);

export function moneyNowProofLevel(
  confidence: MoneyNowFactConfidence,
): 1 | 2 | 3 {
  return MONEY_NOW_PROOF_LEVEL_BY_CONFIDENCE[confidence];
}

export const MONEY_NOW_MODEL_FIT_DEFAULT: MoneyNowModelFit = "fit";

export function evaluateMoneyNowCapacityFit(
  scenarioId: MoneyNowScenarioId,
  facts: Pick<
    Record<MoneyNowFactCode, { state: MoneyNowFactState }>,
    "HAS_UNUSED_CAPACITY" | "CURRENT_OVERLOAD"
  >,
): MoneyNowCapacityFit {
  const mode = MONEY_NOW_CAPACITY_MODES[scenarioId];
  if (mode === "capacity_neutral") return "fit";
  if (mode === "uses_existing_flow") {
    return facts.CURRENT_OVERLOAD.state === "confirmed_true" ? "risk" : "fit";
  }
  if (facts.CURRENT_OVERLOAD.state === "confirmed_true") return "no_fit";
  if (facts.HAS_UNUSED_CAPACITY.state === "confirmed_true") return "fit";
  if (facts.HAS_UNUSED_CAPACITY.state === "confirmed_false") return "no_fit";
  return "risk";
}

export const MONEY_NOW_FACTS_DICTIONARY = Object.freeze({
  version: MONEY_NOW_SELECTOR_CONTRACT_VERSION,
  businessMethodologyVersion: rawContract.businessMethodologyVersion,
  factStateEnum: rawContract.factStateEnum,
  factConfidenceEnum: rawContract.factConfidenceEnum,
  facts: rawContract.facts,
  eligibilityRule: rawContract.eligibilityRule,
  scenarioRequiredFacts: MONEY_NOW_SCENARIO_REQUIRED_FACTS,
  capacityModes: MONEY_NOW_CAPACITY_MODES,
  materialConditionPrimaryCodesByScenario:
    MONEY_NOW_MATERIAL_CONDITION_PRIMARY_CODES,
  materialConditionSupportingCodes:
    MONEY_NOW_MATERIAL_CONDITION_SUPPORTING_CODES,
  materialConditionRule: rawContract.materialConditionRule,
  modelFitRule: rawContract.modelFitRule,
});

