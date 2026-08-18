import { P03_SYSTEM_PROMPT } from "@/server/7k/prompts/p03.v1.4";
import type { P03SelectedPreparedInput } from "./projections";

export function buildP03SystemPrompt(
  input: P03SelectedPreparedInput,
  correction: string | null = null,
): string {
  const prompt = P03_SYSTEM_PROMPT
    .replace("{{P03_CONTEXT_JSON}}", JSON.stringify(input.context))
    .replace("{{SELECTED_MONEY_SCENARIO_JSON}}", JSON.stringify(input.selectedScenario))
    .replace("{{MONEY_SCENARIO_RULES_JSON}}", JSON.stringify(input.moneyScenarioRules))
    .replace("{{MONEY_PRESCRIPTION_RULES_JSON}}", JSON.stringify(input.prescriptionRules))
    .replace("{{INTERVENTION_LIBRARY_JSON}}", JSON.stringify(input.interventionLibrary))
    .replace("{{BACKEND_METRICS_JSON}}", JSON.stringify(input.backendMetrics))
    .replace("{{BACKEND_REVENUE_SCENARIO_JSON}}", JSON.stringify(input.backendRevenueScenario))
    .replace("{{BACKEND_LOCKED_TEASER_JSON}}", JSON.stringify(input.lockedTeaser));
  if (!correction) return prompt;
  return `${prompt}\n\n<CORRECTION_REQUIRED>\n${correction}\n</CORRECTION_REQUIRED>`;
}

