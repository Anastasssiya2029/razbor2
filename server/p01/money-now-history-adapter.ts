import { MONEY_NOW_SCENARIO_IDS } from "@/server/7k/config/money-now.v2.2";
import { MONEY_NOW_HISTORY_MAP } from "@/server/7k/config/money-now-history-map.v2.2";
import type { P01MoneyNowHistoryItem, P01ResultV1_4 } from "./types";

export type MoneyNowHistoryScenarioSnapshot = P01MoneyNowHistoryItem & {
  scenario_id: (typeof MONEY_NOW_SCENARIO_IDS)[number];
  history_key: string;
};

export type MoneyNowHistoryGuardInputV1 = {
  scenarios: Record<
    (typeof MONEY_NOW_SCENARIO_IDS)[number],
    MoneyNowHistoryScenarioSnapshot
  >;
};

/**
 * Lossless adapter for the future deterministic Stage 7 history guard.
 * It deliberately does not create selector input: every P-01 status and
 * evidence reference remains distinguishable.
 */
export function buildMoneyNowHistoryGuardInput(
  history: P01ResultV1_4["moneyNowHistory"],
): MoneyNowHistoryGuardInputV1 {
  return {
    scenarios: Object.fromEntries(
      MONEY_NOW_SCENARIO_IDS.map((scenarioId) => [
        scenarioId,
        {
          scenario_id: scenarioId,
          history_key: MONEY_NOW_HISTORY_MAP.scenarios[scenarioId].historyKey,
          history_status: history[scenarioId].history_status,
          new_material_condition: history[scenarioId].new_material_condition,
          condition_codes: [...history[scenarioId].condition_codes],
          summary: history[scenarioId].summary,
          evidence_ids: [...history[scenarioId].evidence_ids],
          new_condition_evidence_ids: [
            ...history[scenarioId].new_condition_evidence_ids,
          ],
          confidence: history[scenarioId].confidence,
        },
      ]),
    ) as MoneyNowHistoryGuardInputV1["scenarios"],
  };
}

