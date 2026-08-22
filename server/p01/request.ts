import type { DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import { EVIDENCE_ROUTING, EVIDENCE_ROUTING_GLOBAL_CONTEXT } from "@/server/7k/config/evidence-routing.v3.0";
import { MONEY_NOW_HISTORY_MAP } from "@/server/7k/config/money-now-history-map.v2.2";
import { MONEY_NOW_FACT_EXTRACTION_DICTIONARY } from "@/server/7k/config/money-now-fact-extraction.v1";
import { SCORING_RULES } from "@/server/7k/config/scoring-rules.v2.0";
import { TARGET_MODEL_DICTIONARY } from "@/server/7k/config/target-model-dictionary.v2.2";
import { P01_SYSTEM_PROMPT_TEMPLATE } from "@/server/7k/prompts/p01.v1.4";

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
  prompt = replaceRequired(
    prompt,
    "{{MONEY_NOW_FACT_EXTRACTION_JSON}}",
    MONEY_NOW_FACT_EXTRACTION_DICTIONARY,
  );
  prompt = replaceRequired(prompt, "{{DIAGNOSTIC_INPUT_JSON}}", input);

  prompt += `\n\n<TARGET_HORIZON_CONTROL>\n`;
  prompt += `Для activatedCapabilities применяй nextLevelTargetPolicy и delegationMaturityLadder из TARGET_MODEL_DICTIONARY буквально.\n`;
  prompt += `В activatedCapabilities включай только возможности реалистичного следующего уровня в срок target.deadlineMonths.\n`;
  prompt += `Дальнюю автономность, масштаб и будущую роль владельца сохраняй только в desiredRoleSummary; они не должны повышать target через capability или modifier.\n`;
  prompt += `Не смешивай помощь владельцу, делегирование задач, передачу процесса и результата, руководителей функций, слой управления и автономную организацию.\n`;
  prompt += `Если формулировка смешивает ближайший шаг и дальнее видение, активируй более узкий ближайший шаг.\n`;
  prompt += `</TARGET_HORIZON_CONTROL>`;
  prompt += `\n\n<OUTPUT_CONTRACT_CONTROL>\n`;
  prompt += `Корневое поле promptVersion должно быть ровно "P-01.v1.4.2".\n`;
  prompt += `Корневое поле schemaVersion должно быть ровно "1.4".\n`;
  prompt += `Не используй названия версии из описательных заголовков вместо этих двух точных констант.\n`;
  prompt += `</OUTPUT_CONTRACT_CONTROL>`;

  if (correction) {
    prompt += `\n\n<CONTROLLED_REEVALUATION>\nИсправь только перечисленные противоречия, не меняя вход и versioned rules:\n${correction}\n</CONTROLLED_REEVALUATION>`;
  }
  return prompt;
}
