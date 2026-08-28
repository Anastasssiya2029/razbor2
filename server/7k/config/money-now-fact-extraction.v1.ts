import contractJson from "./money-now-selector-contract.v1.json";

export const MONEY_NOW_FACT_EXTRACTION_VERSION =
  "money-now-fact-extraction.v1" as const;

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
export type MoneyNowFactEvidencePolicy =
  | "current_required"
  | "current_or_historical_repeatable"
  | "historical_allowed";

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

type ExtractionSource = {
  businessMethodologyVersion: "money-now.v2.2";
  facts: Array<{ code: MoneyNowFactCode; definition: string }>;
};

const extractionSource = contractJson as ExtractionSource;

const HISTORICAL_ALLOWED_FACTS = new Set<MoneyNowFactCode>([
  "HAS_FORMER_CLIENTS",
  "BEST_PERIOD_PAYMENTS_CONFIRMED",
  "BEST_PERIOD_MECHANISM_IDENTIFIED",
  "PROVEN_CHANNEL_PAYMENTS_CONFIRMED",
  "PROVEN_EVENT_PAYMENTS_CONFIRMED",
]);

const CURRENT_OR_HISTORICAL_REPEATABLE_FACTS = new Set<MoneyNowFactCode>([
  "CLIENT_SATISFACTION_CONFIRMED",
  "REPEATED_WORK_PATTERN_EXISTS",
  "REFERRAL_APPROPRIATE",
  "DEMAND_CONFIRMED",
  "PAID_TRAFFIC_PROVEN",
]);

function evidencePolicyForFact(
  factCode: MoneyNowFactCode,
): MoneyNowFactEvidencePolicy {
  if (HISTORICAL_ALLOWED_FACTS.has(factCode)) return "historical_allowed";
  if (CURRENT_OR_HISTORICAL_REPEATABLE_FACTS.has(factCode)) {
    return "current_or_historical_repeatable";
  }
  return "current_required";
}

const sourceCodes = extractionSource.facts.map((fact) => fact.code);
if (
  sourceCodes.length !== MONEY_NOW_FACT_CODES.length ||
  new Set(sourceCodes).size !== MONEY_NOW_FACT_CODES.length ||
  MONEY_NOW_FACT_CODES.some((factCode) => !sourceCodes.includes(factCode))
) {
  throw new Error("Money Now extraction dictionary must contain exactly 44 unique facts.");
}

export const MONEY_NOW_FACT_EXTRACTION_REGISTRY = Object.freeze(
  extractionSource.facts.map((fact) =>
    Object.freeze({
      code: fact.code,
      definition: fact.definition,
      evidencePolicy: evidencePolicyForFact(fact.code),
    }),
  ),
);

export const MONEY_NOW_FACT_EVIDENCE_POLICIES = Object.freeze(
  Object.fromEntries(
    MONEY_NOW_FACT_EXTRACTION_REGISTRY.map((fact) => [
      fact.code,
      fact.evidencePolicy,
    ]),
  ) as Record<MoneyNowFactCode, MoneyNowFactEvidencePolicy>,
);

export const MONEY_NOW_FACT_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    MONEY_NOW_FACT_EXTRACTION_REGISTRY.map((fact) => [
      fact.code,
      fact.definition,
    ]),
  ) as Record<MoneyNowFactCode, string>,
);

export const MONEY_NOW_FACT_EXTRACTION_DICTIONARY = Object.freeze({
  version: MONEY_NOW_FACT_EXTRACTION_VERSION,
  businessMethodologyVersion: extractionSource.businessMethodologyVersion,
  triStateSemantics: Object.freeze({
    confirmed_true:
      "Факт подтверждён evidence с time_scope, разрешённым evidencePolicy этого fact code.",
    confirmed_false:
      "Противоположный факт подтверждён evidence с valence=negative и time_scope, разрешённым evidencePolicy; отсутствие упоминания не является false.",
    unknown:
      "Данных недостаточно, evidence имеет hypothesis scope либо нет evidence с допустимым time_scope.",
  }),
  facts: MONEY_NOW_FACT_EXTRACTION_REGISTRY,
  globalAllowedMaterialConditionCodes: MONEY_NOW_MATERIAL_CONDITION_CODES,
});

