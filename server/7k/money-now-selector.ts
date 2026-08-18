import {
  MONEY_NOW_HISTORY_GUARD,
  MONEY_NOW_RESOURCE_VERSION,
  MONEY_NOW_SCENARIOS,
  MONEY_NOW_STOP_RULES,
  MONEY_PROXIMITY_HIERARCHY,
  type MoneyNowScenarioId,
  type MoneyNowSignalCode,
} from "./config/money-now.v2.2";
import { SevenKValidationError } from "./types";

export type MoneyNowScenarioFacts = {
  proofLevel: 0 | 1 | 2 | 3;
  signalSpeedRank?: 1 | 2 | 3 | 4;
  complexityRank?: 1 | 2 | 3 | 4;
  modelFit?: boolean;
  newMaterialCondition?: string | null;
};

export type MoneyNowPreviousAttempt = {
  historyKey: string;
  sustainableResult: boolean;
};

export type MoneyNowSelectorInput = {
  signals: Partial<Record<MoneyNowSignalCode, boolean>>;
  scenarioFacts?: Partial<Record<MoneyNowScenarioId, MoneyNowScenarioFacts>>;
  previousAttempts?: readonly MoneyNowPreviousAttempt[];
};

export type MoneyNowRankedCandidate = {
  scenarioId: MoneyNowScenarioId;
  proximityRank: number;
  proofLevel: number;
  signalSpeedRank: number;
  complexityRank: number;
};

export type MoneyNowExcludedCandidate = {
  scenarioId: MoneyNowScenarioId;
  reason: "not_eligible" | "stop_rule" | "capacity_or_model_fit" | "history_guard";
  codes: string[];
};

export type MoneyNowSelectionResult = {
  resourceVersion: typeof MONEY_NOW_RESOURCE_VERSION;
  selectedScenarioId: MoneyNowScenarioId | null;
  status: "selected" | "no_fit";
  rankedCandidates: MoneyNowRankedCandidate[];
  excludedCandidates: MoneyNowExcludedCandidate[];
};

const PROXIMITY_RANK = Object.fromEntries(
  MONEY_PROXIMITY_HIERARCHY.map((item) => [item.tier, item.rank]),
) as Record<(typeof MONEY_PROXIMITY_HIERARCHY)[number]["tier"], number>;

function validateRank(
  value: number,
  path: string,
  minimum: number,
  maximum: number,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new SevenKValidationError([
      {
        path,
        code: "invalid_rank",
        message: `Ожидается целое число от ${minimum} до ${maximum}.`,
      },
    ]);
  }
}

function hasSignal(
  signals: Partial<Record<MoneyNowSignalCode, boolean>>,
  signal: MoneyNowSignalCode,
): boolean {
  return signals[signal] === true;
}

export function selectMoneyNowCandidate(input: MoneyNowSelectorInput): MoneyNowSelectionResult {
  const rankedCandidates: MoneyNowRankedCandidate[] = [];
  const excludedCandidates: MoneyNowExcludedCandidate[] = [];

  for (const scenario of MONEY_NOW_SCENARIOS) {
    const missingEligibility = scenario.eligibilityAllOf.filter(
      (signal) => !hasSignal(input.signals, signal),
    );
    if (missingEligibility.length > 0) {
      excludedCandidates.push({
        scenarioId: scenario.id,
        reason: "not_eligible",
        codes: missingEligibility,
      });
      continue;
    }

    const triggeredStopRules = scenario.stopRuleIds.filter((stopRuleId) => {
      const stopRule = MONEY_NOW_STOP_RULES.find((rule) => rule.id === stopRuleId);
      if (!stopRule) {
        throw new SevenKValidationError([
          {
            path: `/moneyNow/scenarios/${scenario.id}/stopRuleIds`,
            code: "unknown_stop_rule",
            message: `Не найден stop rule ${stopRuleId}.`,
          },
        ]);
      }
      return stopRule.requiredTrueSignals.some((signal) => !hasSignal(input.signals, signal));
    });
    if (triggeredStopRules.length > 0) {
      excludedCandidates.push({
        scenarioId: scenario.id,
        reason: "stop_rule",
        codes: triggeredStopRules,
      });
      continue;
    }

    const facts = input.scenarioFacts?.[scenario.id];
    const capacityBlocked =
      input.signals.owner_or_team_overloaded === true && scenario.capacityDemand === "adds_load";
    const modelBlocked = facts?.modelFit === false;
    if (capacityBlocked || modelBlocked) {
      excludedCandidates.push({
        scenarioId: scenario.id,
        reason: "capacity_or_model_fit",
        codes: [
          ...(capacityBlocked ? ["CAPACITY_OVERLOADED"] : []),
          ...(modelBlocked ? ["MODEL_FIT_REQUIRED"] : []),
        ],
      });
      continue;
    }

    const repeatedFailedAttempt = (input.previousAttempts ?? []).some(
      (attempt) => attempt.historyKey === scenario.historyKey && !attempt.sustainableResult,
    );
    const hasNewCondition = Boolean(facts?.newMaterialCondition?.trim());
    if (repeatedFailedAttempt && !hasNewCondition) {
      excludedCandidates.push({
        scenarioId: scenario.id,
        reason: "history_guard",
        codes: [MONEY_NOW_HISTORY_GUARD.id],
      });
      continue;
    }

    const proofLevel = facts?.proofLevel ?? 0;
    const signalSpeedRank = facts?.signalSpeedRank ?? scenario.defaultSignalSpeedRank;
    const complexityRank = facts?.complexityRank ?? scenario.defaultComplexityRank;
    validateRank(proofLevel, `/scenarioFacts/${scenario.id}/proofLevel`, 0, 3);
    validateRank(signalSpeedRank, `/scenarioFacts/${scenario.id}/signalSpeedRank`, 1, 4);
    validateRank(complexityRank, `/scenarioFacts/${scenario.id}/complexityRank`, 1, 4);

    rankedCandidates.push({
      scenarioId: scenario.id,
      proximityRank: PROXIMITY_RANK[scenario.proximityTier],
      proofLevel,
      signalSpeedRank,
      complexityRank,
    });
  }

  rankedCandidates.sort(
    (left, right) =>
      left.proximityRank - right.proximityRank ||
      right.proofLevel - left.proofLevel ||
      right.signalSpeedRank - left.signalSpeedRank ||
      left.complexityRank - right.complexityRank ||
      left.scenarioId.localeCompare(right.scenarioId, "en"),
  );

  return {
    resourceVersion: MONEY_NOW_RESOURCE_VERSION,
    selectedScenarioId: rankedCandidates[0]?.scenarioId ?? null,
    status: rankedCandidates.length > 0 ? "selected" : "no_fit",
    rankedCandidates,
    excludedCandidates,
  };
}
