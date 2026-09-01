import {
  MONEY_NOW_HISTORY_GUARD,
  MONEY_NOW_SCENARIOS,
  type MoneyNowScenarioId,
} from "./money-now.v2.2";

export const MONEY_NOW_HISTORY_MAP_RESOURCE_VERSION =
  "money-now-history-map.v2.2" as const;

export const MONEY_NOW_HISTORY_MAP = {
  version: MONEY_NOW_HISTORY_MAP_RESOURCE_VERSION,
  purpose:
    "Классификация истории MN01–MN16 для deterministic history guard. Не выбирает и не ранжирует текущий сценарий.",
  scenarios: Object.fromEntries(
    MONEY_NOW_SCENARIOS.map((scenario) => [
      scenario.id,
      {
        id: scenario.id,
        title: scenario.title,
        historyKey: scenario.historyKey,
        whenApplicable: scenario.whenApplicable,
        moneyMechanism: scenario.moneyMechanism,
      },
    ]),
  ) as Record<
    MoneyNowScenarioId,
    {
      id: MoneyNowScenarioId;
      title: string;
      historyKey: string;
      whenApplicable: string;
      moneyMechanism: string;
    }
  >,
  historyStatuses: [
    "not_reported",
    "worked_sustained",
    "worked_temporarily",
    "tried_no_sustained_result",
    "unclear",
  ],
  materialConditionStatuses: ["yes", "no", "unknown", "not_applicable"],
  conditionCodes: [
    "AUDIENCE",
    "PRODUCT",
    "QUALIFICATION",
    "SALES_TECHNOLOGY",
    "SEQUENCE",
    "CAPACITY",
    "CHANNEL_CONTEXT",
    "OFFER",
    "PRICE",
    "TEAM",
    "OTHER_PREREQUISITE",
  ],
  historyGuard: MONEY_NOW_HISTORY_GUARD,
} as const;

