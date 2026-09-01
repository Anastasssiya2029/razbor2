import type { P04PreparedInput } from "./stage-types";
import { P04_OUTPUT_SCHEMA } from "./validation";

function projectProviderSchema(): Record<string, unknown> {
  const schema = structuredClone(P04_OUTPUT_SCHEMA) as {
    required?: string[];
    properties?: Record<string, unknown>;
  };
  schema.required = (schema.required ?? []).filter((field) => field !== "moneyNow");
  delete schema.properties?.moneyNow;
  return schema as Record<string, unknown>;
}

export const P04_WITHOUT_MONEY_NOW_OUTPUT_SCHEMA = projectProviderSchema();

/** Add a deterministic hidden compatibility block before full local validation. */
export function hydrateDisabledP04MoneyNow(
  value: unknown,
  input: P04PreparedInput,
): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const result = structuredClone(value) as Record<string, unknown>;
  result.moneyNow = {
    status: input.reportPolicy.moneyNowStatus,
    scenario_id: input.context.moneyNow.selectedScenario?.scenario_id ?? null,
    headline: "Раздел временно отключён",
    narrative: null,
    locked_teaser: input.context.moneyNow.lockedTeaser,
    source_refs: ["MN:selection"],
  };
  return result;
}
