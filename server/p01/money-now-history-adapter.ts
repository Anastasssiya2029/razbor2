import { MONEY_NOW_SCENARIO_IDS } from "@/server/7k/config/money-now.v2.2";
import { MONEY_NOW_HISTORY_MAP } from "@/server/7k/config/money-now-history-map.v2.2";
import type {
  MoneyNowPreviousAttempt,
  MoneyNowScenarioFacts,
} from "@/server/7k/money-now-selector";
import type { P01ResultV1_3 } from "./types";

export type MoneyNowHistoryGuardInput = {
  previousAttempts: MoneyNowPreviousAttempt[];
  scenarioFacts: Partial<Record<(typeof MONEY_NOW_SCENARIO_IDS)[number], MoneyNowScenarioFacts>>;
};

/**
 * Produces deterministic history-guard facts for Stage 2 without running or
 * selecting a Money Now scenario. `not_reported` creates no previous attempt.
 */
export function buildMoneyNowHistoryGuardInput(
  history: P01ResultV1_3["moneyNowHistory"],
): MoneyNowHistoryGuardInput {
  const previousAttempts: MoneyNowPreviousAttempt[] = [];
  const scenarioFacts: MoneyNowHistoryGuardInput["scenarioFacts"] = {};

  for (const scenarioId of MONEY_NOW_SCENARIO_IDS) {
    const item = history[scenarioId];
    if (item.history_status !== "not_reported") {
      previousAttempts.push({
        historyKey: MONEY_NOW_HISTORY_MAP.scenarios[scenarioId].historyKey,
        sustainableResult: item.history_status === "worked_sustained",
      });
    }
    scenarioFacts[scenarioId] = {
      proofLevel: 0,
      newMaterialCondition:
        item.new_material_condition === "yes"
          ? item.summary ?? item.condition_codes.join(", ")
          : null,
    };
  }
  return { previousAttempts, scenarioFacts };
}

