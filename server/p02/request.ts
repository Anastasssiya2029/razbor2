import { CONSTRAINT_RULES, DEPENDENCY_RULES, LEVEL_CAPABILITIES } from "@/server/7k/config/p02-strategy-rules.v2.1";
import { P02_SYSTEM_PROMPT } from "@/server/7k/prompts/p02.v1.3";
import type { P01StrategyContext, TargetConfigProjection } from "./types";

export function buildP02SystemPrompt(
  strategyContext: P01StrategyContext,
  targetConfig: TargetConfigProjection,
  correction: string | null = null,
): string {
  const injected = P02_SYSTEM_PROMPT
    .replace("{{P01_STRATEGY_CONTEXT_JSON}}", JSON.stringify(strategyContext))
    .replace("{{TARGET_CONFIG_JSON}}", JSON.stringify(targetConfig))
    .replace("{{LEVEL_CAPABILITIES_JSON}}", JSON.stringify(LEVEL_CAPABILITIES))
    .replace("{{DEPENDENCY_RULES_JSON}}", JSON.stringify(DEPENDENCY_RULES))
    .replace("{{CONSTRAINT_RULES_JSON}}", JSON.stringify(CONSTRAINT_RULES));
  if (!correction) return injected;
  return `${injected}\n\n<CORRECTION_REQUIRED>\n${correction}\n</CORRECTION_REQUIRED>`;
}

