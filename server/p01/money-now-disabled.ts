import { MONEY_NOW_FACT_CODES } from "@/server/7k/config/money-now-fact-extraction.v1";
import { MONEY_NOW_SCENARIO_IDS } from "@/server/7k/config/money-now.v2.2";
import type { P01ResultV1_4_2 } from "./types";
import { P01_OUTPUT_SCHEMA } from "./validation";

const MONEY_NOW_ROOT_FIELDS = [
  "moneyNowSignals",
  "moneyNowFacts",
  "moneyNowHistory",
] as const;

function projectProviderSchema(): Record<string, unknown> {
  const schema = structuredClone(P01_OUTPUT_SCHEMA) as {
    required?: string[];
    properties?: Record<string, unknown>;
  };
  schema.required = (schema.required ?? []).filter(
    (field) => !MONEY_NOW_ROOT_FIELDS.includes(field as (typeof MONEY_NOW_ROOT_FIELDS)[number]),
  );
  for (const field of MONEY_NOW_ROOT_FIELDS) delete schema.properties?.[field];
  return schema as Record<string, unknown>;
}

export const P01_WITHOUT_MONEY_NOW_OUTPUT_SCHEMA = projectProviderSchema();

/**
 * Preserve the persisted P-01 v1.4 contract while keeping deferred Money Now
 * work out of the provider request.  Downstream legacy stages receive an
 * explicit fail-closed snapshot and therefore cannot invent a scenario.
 */
export function hydrateDisabledMoneyNow(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const result = structuredClone(value) as Record<string, unknown>;
  result.moneyNowSignals = [];
  result.moneyNowFacts = Object.fromEntries(
    MONEY_NOW_FACT_CODES.map((factCode) => [
      factCode,
      { state: "unknown", confidence: "low", summary: null, evidence_ids: [] },
    ]),
  ) satisfies P01ResultV1_4_2["moneyNowFacts"];
  result.moneyNowHistory = Object.fromEntries(
    MONEY_NOW_SCENARIO_IDS.map((scenarioId) => [
      scenarioId,
      {
        history_status: "not_reported",
        new_material_condition: "not_applicable",
        condition_codes: [],
        summary: null,
        evidence_ids: [],
        new_condition_evidence_ids: [],
        confidence: "low",
      },
    ]),
  ) satisfies P01ResultV1_4_2["moneyNowHistory"];
  return result;
}
