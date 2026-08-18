import type { DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import { EVIDENCE_ROUTING, EVIDENCE_ROUTING_GLOBAL_CONTEXT } from "@/server/7k/config/evidence-routing.v3.0";
import { MONEY_NOW_HISTORY_MAP } from "@/server/7k/config/money-now-history-map.v2.2";
import { SCORING_RULES } from "@/server/7k/config/scoring-rules.v2.0";
import { TARGET_MODEL_DICTIONARY } from "@/server/7k/config/target-model-dictionary.v2.1";
import { P01_SYSTEM_PROMPT_TEMPLATE } from "@/server/7k/prompts/p01.v1.3";

function replaceRequired(template: string, marker: string, value: unknown): string {
  if (!template.includes(marker)) throw new Error(`P-01 prompt marker is missing: ${marker}`);
  return template.replace(marker, JSON.stringify(value));
}

export function buildP01SystemPrompt(
  input: DiagnosticInputV1_2,
  correction: string | null = null,
): string {
  let prompt = P01_SYSTEM_PROMPT_TEMPLATE;
  prompt = replaceRequired(prompt, "{{SCORING_RULES_JSON}}", SCORING_RULES);
  prompt = replaceRequired(prompt, "{{EVIDENCE_ROUTING_JSON}}", {
    version: "evidence-routing.v3.0",
    elements: EVIDENCE_ROUTING,
    global: EVIDENCE_ROUTING_GLOBAL_CONTEXT,
  });
  prompt = replaceRequired(prompt, "{{TARGET_MODEL_DICTIONARY_JSON}}", TARGET_MODEL_DICTIONARY);
  prompt = replaceRequired(prompt, "{{MONEY_NOW_HISTORY_MAP_JSON}}", MONEY_NOW_HISTORY_MAP);
  prompt = replaceRequired(prompt, "{{DIAGNOSTIC_INPUT_JSON}}", input);

  if (correction) {
    prompt += `\n\n<CONTROLLED_REEVALUATION>\nИсправь только перечисленные противоречия, не меняя вход и versioned rules:\n${correction}\n</CONTROLLED_REEVALUATION>`;
  }
  return prompt;
}

