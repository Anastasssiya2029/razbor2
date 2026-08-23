import {
  CONSTRAINT_RULES,
  DEPENDENCY_RULES,
  LEVEL_CAPABILITIES,
  projectTransitionLevers,
} from "@/server/7k/config/p02-strategy-rules.v2.1";
import { P02_SYSTEM_PROMPT } from "@/server/7k/prompts/p02.v1.3";
import { SEVEN_K_ELEMENT_IDS, type SevenKScores } from "@/server/7k/types";
import type { P01StrategyContext, TargetConfigProjection } from "./types";

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
  if (!correction) return injected;
  return `${injected}\n\n<CORRECTION_REQUIRED>\n${correction}\n</CORRECTION_REQUIRED>`;
}
