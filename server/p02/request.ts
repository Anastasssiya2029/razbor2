import {
  CONSTRAINT_RULES,
  DEPENDENCY_RULES,
  LEVEL_CAPABILITIES,
  projectTransitionLevers,
} from "@/server/7k/config/p02-strategy-rules.v2.1";
import { P02_SYSTEM_PROMPT } from "@/server/7k/prompts/p02.v1.3";
import { SEVEN_K_ELEMENT_IDS, type SevenKScores } from "@/server/7k/types";
import p02OutputSchema from "@/schemas/p02-transition-strategist.output.v1.3.schema.json";
import type { P01StrategyContext, TargetConfigProjection } from "./types";
import { collectAllowedP02BusinessNumbers } from "./validation";

export function buildP02SystemPrompt(
  strategyContext: P01StrategyContext,
  targetConfig: TargetConfigProjection,
  correction: string | null = null,
): string {
  const currentScores = Object.fromEntries(
    SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, strategyContext.current7k[elementId].score]),
  ) as SevenKScores;
  const levelCapabilities = {
    ...LEVEL_CAPABILITIES,
    relevantTransitionLevers: projectTransitionLevers(currentScores, targetConfig.targetScores),
  };
  const injected = P02_SYSTEM_PROMPT
    .replace("{{P01_STRATEGY_CONTEXT_JSON}}", JSON.stringify(strategyContext))
    .replace("{{TARGET_CONFIG_JSON}}", JSON.stringify(targetConfig))
    .replace("{{LEVEL_CAPABILITIES_JSON}}", JSON.stringify(levelCapabilities))
    .replace("{{DEPENDENCY_RULES_JSON}}", JSON.stringify(DEPENDENCY_RULES))
    .replace("{{CONSTRAINT_RULES_JSON}}", JSON.stringify(CONSTRAINT_RULES));
  const allowedBusinessNumbers = collectAllowedP02BusinessNumbers(strategyContext);
  const canonicalGuard = [
    "<P02_CANONICAL_INPUT_RULES>",
    "TARGET_CONFIG уже детерминированно проверен backend и не является гипотезой AI.",
    "modelFamily/modelComponents описывают ближайшую достижимую конфигурацию под денежную цель.",
    "visionModelFamily/visionModelComponents описывают выбранную клиентом более дальнюю модель.",
    "Различие между ближайшей и дальней моделью намеренно и НЕ является TARGET_CONFIG_INCONSISTENCY.",
    "modelTransitionNote объясняет этот поэтапный переход; используй его как контекст, а не как основание блокировки.",
    "Стратегию ближайшего перехода собирай по modelFamily и targetScores; visionModelFamily не подменяет этот маршрут.",
    `Разрешённые точные числа для businessValidation baseline_value: ${JSON.stringify(allowedBusinessNumbers)}.`,
    "baseline_value может быть только одним из этих чисел; если подходящего числа нет, верни null.",
    "Не извлекай baseline_value из свободного текста evidenceLedger, businessMap или описания выручки.",
    "target_value также не является рыночной нормой: без разрешённого числа либо доказанной формулы верни null.",
    "</P02_CANONICAL_INPUT_RULES>",
  ].join("\n");
  const contracted = `${injected}\n\n${canonicalGuard}\n\n<P02_OUTPUT_SCHEMA_JSON>\n${JSON.stringify(p02OutputSchema)}\n</P02_OUTPUT_SCHEMA_JSON>\nВерни один JSON-объект строго с корневыми полями этой схемы. Не добавляй другие корневые поля и не заменяй структуру собственной.`;
  if (!correction) return contracted;
  return `${contracted}\n\n<CORRECTION_REQUIRED>\n${correction}\n</CORRECTION_REQUIRED>`;
}
