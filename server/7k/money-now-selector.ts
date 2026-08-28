import {
  MONEY_NOW_CAPACITY_MODES,
  MONEY_NOW_MATERIAL_CONDITION_FACT_CODES,
  MONEY_NOW_MATERIAL_CONDITION_PRIMARY_CODES,
  MONEY_NOW_MODEL_FIT_DEFAULT,
  MONEY_NOW_SCENARIO_REQUIRED_FACTS,
  evaluateMoneyNowCapacityFit,
  moneyNowProofLevel,
  type MoneyNowCapacityFit,
  type MoneyNowModelFit,
} from "./config/money-now-selector-contract.v1";
import {
  MONEY_NOW_FACT_CODES,
  type MoneyNowFactCode,
  type MoneyNowFactConfidence,
  type MoneyNowFactState,
} from "./config/money-now-fact-extraction.v1";
import {
  MONEY_NOW_SCENARIOS,
  MONEY_NOW_SCENARIO_IDS,
  MONEY_PROXIMITY_HIERARCHY,
  type MoneyNowScenarioId,
  type MoneyProximityTier,
} from "./config/money-now.v2.2";
import type { MoneyNowHistoryGuardInputV1 } from "@/server/p01/money-now-history-adapter";
import type {
  P01Evidence,
  P01MoneyNowFacts,
  P01MoneyNowHistoryItem,
} from "@/server/p01/types";

export type MoneyNowSelectorInputV1_1 = {
  facts: P01MoneyNowFacts;
  history: MoneyNowHistoryGuardInputV1;
  evidenceLedger: P01Evidence[];
};

export type MoneyNowRequiredFactTrace = {
  factCode: MoneyNowFactCode;
  state: MoneyNowFactState;
  confidence: MoneyNowFactConfidence;
  evidenceIds: string[];
};

export type MoneyNowRankingCriterion =
  | "proximity_to_money"
  | "proof_level"
  | "estimated_time_to_signal"
  | "complexity"
  | "stable_scenario_id";

export type MoneyNowCandidateTrace = {
  scenarioId: MoneyNowScenarioId;
  eligible: boolean;
  includedInRanking: boolean;
  requiredFacts: MoneyNowRequiredFactTrace[];
  proofLevel: 1 | 2 | 3 | null;
  capacityMode: (typeof MONEY_NOW_CAPACITY_MODES)[MoneyNowScenarioId];
  capacityFit: MoneyNowCapacityFit;
  modelFit: MoneyNowModelFit;
  historyStatus: P01MoneyNowHistoryItem["history_status"];
  newMaterialCondition: P01MoneyNowHistoryItem["new_material_condition"];
  historyGuardPassed: boolean;
  historyEvidenceIds: string[];
  blockedReasonCodes: string[];
  ranking: {
    proximityRank: number;
    signalSpeedRank: 1 | 2 | 3 | 4;
    complexityRank: 1 | 2 | 3 | 4;
    finalRank: number | null;
    decidingCriterion: MoneyNowRankingCriterion | null;
  };
};

export type MoneyNowSelectedScenario = {
  scenarioId: MoneyNowScenarioId;
  moneyDistance: MoneyProximityTier;
  proximityRank: number;
  proofLevel: 1 | 2 | 3;
  capacityFit: Exclude<MoneyNowCapacityFit, "no_fit">;
  modelFit: MoneyNowModelFit;
  estimatedTimeToSignalDays: null;
  signalSpeedRank: 1 | 2 | 3 | 4;
  complexity: "low" | "medium" | "high";
  complexityRank: 1 | 2 | 3 | 4;
  evidenceIds: string[];
};

export type MoneyNowRankingComparison = {
  higherScenarioId: MoneyNowScenarioId;
  lowerScenarioId: MoneyNowScenarioId;
  decidingCriterion: MoneyNowRankingCriterion;
};

export type MoneyNowSelectionDecision = {
  selectionStatus: "selected" | "no_eligible_scenario";
  selectedScenario: MoneyNowSelectedScenario | null;
  candidateTrace: MoneyNowCandidateTrace[];
  rankingTrace: {
    orderedScenarioIds: MoneyNowScenarioId[];
    comparisons: MoneyNowRankingComparison[];
  };
};

export class MoneyNowSelectorInvariantError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "MoneyNowSelectorInvariantError";
  }
}

type RankedCandidate = {
  trace: MoneyNowCandidateTrace;
  scenario: (typeof MONEY_NOW_SCENARIOS)[number];
};

const SCENARIO_BY_ID = Object.fromEntries(
  MONEY_NOW_SCENARIOS.map((scenario) => [scenario.id, scenario]),
) as Record<MoneyNowScenarioId, (typeof MONEY_NOW_SCENARIOS)[number]>;

const PROXIMITY_RANK = Object.fromEntries(
  MONEY_PROXIMITY_HIERARCHY.map((distance) => [distance.tier, distance.rank]),
) as Record<MoneyProximityTier, number>;

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));
}

function assertExactInputShape(input: MoneyNowSelectorInputV1_1): void {
  const factCodes = Object.keys(input.facts).sort();
  const expectedFacts = [...MONEY_NOW_FACT_CODES].sort();
  if (
    factCodes.length !== expectedFacts.length ||
    factCodes.some((factCode, index) => factCode !== expectedFacts[index])
  ) {
    throw new MoneyNowSelectorInvariantError(
      "MONEY_NOW_SELECTOR_FACT_SET_INVALID",
      "Selector requires exactly the 44 canonical P-01 moneyNowFacts.",
    );
  }
  const historyIds = Object.keys(input.history.scenarios).sort();
  const expectedHistory = [...MONEY_NOW_SCENARIO_IDS].sort();
  if (
    historyIds.length !== expectedHistory.length ||
    historyIds.some((scenarioId, index) => scenarioId !== expectedHistory[index])
  ) {
    throw new MoneyNowSelectorInvariantError(
      "MONEY_NOW_SELECTOR_HISTORY_SET_INVALID",
      "Selector requires exact lossless history for MN01–MN16.",
    );
  }
}

function assertEvidenceTraceability(input: MoneyNowSelectorInputV1_1): Map<string, P01Evidence> {
  const evidenceById = new Map<string, P01Evidence>();
  for (const evidence of input.evidenceLedger) {
    if (evidenceById.has(evidence.id)) {
      throw new MoneyNowSelectorInvariantError(
        "MONEY_NOW_SELECTOR_DUPLICATE_EVIDENCE_ID",
        `Duplicate evidence ID ${evidence.id}.`,
      );
    }
    evidenceById.set(evidence.id, evidence);
  }
  const assertIds = (ids: readonly string[], path: string) => {
    for (const evidenceId of ids) {
      if (!evidenceById.has(evidenceId)) {
        throw new MoneyNowSelectorInvariantError(
          "MONEY_NOW_SELECTOR_DANGLING_EVIDENCE_ID",
          `${path} references missing evidence ID ${evidenceId}.`,
        );
      }
    }
  };
  for (const factCode of MONEY_NOW_FACT_CODES) {
    assertIds(input.facts[factCode].evidence_ids, `/facts/${factCode}/evidence_ids`);
  }
  for (const scenarioId of MONEY_NOW_SCENARIO_IDS) {
    const history = input.history.scenarios[scenarioId];
    assertIds(history.evidence_ids, `/history/${scenarioId}/evidence_ids`);
    assertIds(
      history.new_condition_evidence_ids,
      `/history/${scenarioId}/new_condition_evidence_ids`,
    );
  }
  return evidenceById;
}

function requiredFactTrace(
  scenarioId: MoneyNowScenarioId,
  facts: P01MoneyNowFacts,
): MoneyNowRequiredFactTrace[] {
  return MONEY_NOW_SCENARIO_REQUIRED_FACTS[scenarioId].map((factCode) => ({
    factCode,
    state: facts[factCode].state,
    confidence: facts[factCode].confidence,
    evidenceIds: [...facts[factCode].evidence_ids],
  }));
}

function proofLevel(requiredFacts: MoneyNowRequiredFactTrace[]): 1 | 2 | 3 | null {
  if (!requiredFacts.every((fact) => fact.state === "confirmed_true")) return null;
  return Math.min(
    ...requiredFacts.map((fact) => moneyNowProofLevel(fact.confidence)),
  ) as 1 | 2 | 3;
}

function validNewMaterialCondition(
  scenarioId: MoneyNowScenarioId,
  input: MoneyNowSelectorInputV1_1,
  evidenceById: ReadonlyMap<string, P01Evidence>,
): boolean {
  const history = input.history.scenarios[scenarioId];
  if (history.new_material_condition !== "yes") return false;
  const primaryCodes = history.condition_codes.filter((conditionCode) =>
    MONEY_NOW_MATERIAL_CONDITION_PRIMARY_CODES[scenarioId].includes(conditionCode),
  );
  if (primaryCodes.length === 0) return false;
  return primaryCodes.some((conditionCode) =>
    history.new_condition_evidence_ids.some((evidenceId) => {
      if (evidenceById.get(evidenceId)?.time_scope !== "current") return false;
      return MONEY_NOW_MATERIAL_CONDITION_FACT_CODES[conditionCode].some((factCode) => {
        const fact = input.facts[factCode];
        return fact.state === "confirmed_true" && fact.evidence_ids.includes(evidenceId);
      });
    }),
  );
}

function historyGuard(
  scenarioId: MoneyNowScenarioId,
  input: MoneyNowSelectorInputV1_1,
  evidenceById: ReadonlyMap<string, P01Evidence>,
): { passed: boolean; reasonCode: string | null } {
  const history = input.history.scenarios[scenarioId];
  if (
    history.history_status === "not_reported" ||
    history.history_status === "worked_sustained" ||
    history.history_status === "unclear"
  ) {
    return { passed: true, reasonCode: null };
  }
  if (validNewMaterialCondition(scenarioId, input, evidenceById)) {
    return { passed: true, reasonCode: null };
  }
  return {
    passed: false,
    reasonCode:
      history.history_status === "worked_temporarily"
        ? "HISTORY_WORKED_TEMPORARILY_WITHOUT_VALID_NEW_CONDITION"
        : "HISTORY_TRIED_NO_SUSTAINED_RESULT_WITHOUT_VALID_NEW_CONDITION",
  };
}

function compareCandidates(left: RankedCandidate, right: RankedCandidate): number {
  return (
    left.trace.ranking.proximityRank - right.trace.ranking.proximityRank ||
    right.trace.proofLevel! - left.trace.proofLevel! ||
    right.trace.ranking.signalSpeedRank - left.trace.ranking.signalSpeedRank ||
    left.trace.ranking.complexityRank - right.trace.ranking.complexityRank ||
    left.trace.scenarioId.localeCompare(right.trace.scenarioId, "en")
  );
}

function decidingCriterion(
  higher: RankedCandidate,
  lower: RankedCandidate,
): MoneyNowRankingCriterion {
  if (higher.trace.ranking.proximityRank !== lower.trace.ranking.proximityRank) {
    return "proximity_to_money";
  }
  if (higher.trace.proofLevel !== lower.trace.proofLevel) return "proof_level";
  if (higher.trace.ranking.signalSpeedRank !== lower.trace.ranking.signalSpeedRank) {
    return "estimated_time_to_signal";
  }
  if (higher.trace.ranking.complexityRank !== lower.trace.ranking.complexityRank) {
    return "complexity";
  }
  return "stable_scenario_id";
}

function complexityLabel(rank: 1 | 2 | 3 | 4): "low" | "medium" | "high" {
  if (rank === 1) return "low";
  if (rank === 4) return "high";
  return "medium";
}

/**
 * The only executable Money Now selector. Eligibility comes exclusively from
 * persisted P-01 v1.4.2 atomic facts; ranking is contract/methodology driven.
 */
export function selectMoneyNowCandidate(
  input: MoneyNowSelectorInputV1_1,
): MoneyNowSelectionDecision {
  assertExactInputShape(input);
  const evidenceById = assertEvidenceTraceability(input);
  const traces: MoneyNowCandidateTrace[] = [];
  const ranked: RankedCandidate[] = [];

  for (const scenarioId of MONEY_NOW_SCENARIO_IDS) {
    const scenario = SCENARIO_BY_ID[scenarioId];
    const requiredFacts = requiredFactTrace(scenarioId, input.facts);
    const eligible = requiredFacts.every((fact) => fact.state === "confirmed_true");
    const candidateProofLevel = proofLevel(requiredFacts);
    const capacityFit = evaluateMoneyNowCapacityFit(scenarioId, input.facts);
    const history = input.history.scenarios[scenarioId];
    const historyResult = historyGuard(scenarioId, input, evidenceById);
    const blockedReasonCodes = [
      ...requiredFacts
        .filter((fact) => fact.state === "unknown")
        .map((fact) => `PREREQUISITE_UNKNOWN:${fact.factCode}`),
      ...requiredFacts
        .filter((fact) => fact.state === "confirmed_false")
        .map((fact) => `PREREQUISITE_CONFIRMED_FALSE:${fact.factCode}`),
      ...(capacityFit === "no_fit" ? ["CAPACITY_NO_FIT"] : []),
      ...(historyResult.reasonCode ? [historyResult.reasonCode] : []),
    ];
    const includedInRanking =
      eligible &&
      candidateProofLevel !== null &&
      capacityFit !== "no_fit" &&
      MONEY_NOW_MODEL_FIT_DEFAULT === "fit" &&
      historyResult.passed;
    const trace: MoneyNowCandidateTrace = {
      scenarioId,
      eligible,
      includedInRanking,
      requiredFacts,
      proofLevel: candidateProofLevel,
      capacityMode: MONEY_NOW_CAPACITY_MODES[scenarioId],
      capacityFit,
      modelFit: MONEY_NOW_MODEL_FIT_DEFAULT,
      historyStatus: history.history_status,
      newMaterialCondition: history.new_material_condition,
      historyGuardPassed: historyResult.passed,
      historyEvidenceIds: uniqueSorted([
        ...history.evidence_ids,
        ...history.new_condition_evidence_ids,
      ]),
      blockedReasonCodes,
      ranking: {
        proximityRank: PROXIMITY_RANK[scenario.proximityTier],
        signalSpeedRank: scenario.defaultSignalSpeedRank,
        complexityRank: scenario.defaultComplexityRank,
        finalRank: null,
        decidingCriterion: null,
      },
    };
    traces.push(trace);
    if (includedInRanking) ranked.push({ trace, scenario });
  }

  ranked.sort(compareCandidates);
  const comparisons: MoneyNowRankingComparison[] = [];
  ranked.forEach((candidate, index) => {
    candidate.trace.ranking.finalRank = index + 1;
    if (index > 0) {
      const criterion = decidingCriterion(ranked[index - 1], candidate);
      candidate.trace.ranking.decidingCriterion = criterion;
      comparisons.push({
        higherScenarioId: ranked[index - 1].trace.scenarioId,
        lowerScenarioId: candidate.trace.scenarioId,
        decidingCriterion: criterion,
      });
    }
  });

  const selected = ranked[0];
  if (!selected) {
    return {
      selectionStatus: "no_eligible_scenario",
      selectedScenario: null,
      candidateTrace: traces,
      rankingTrace: { orderedScenarioIds: [], comparisons: [] },
    };
  }
  const selectedHistory = input.history.scenarios[selected.trace.scenarioId];
  const selectedEvidenceIds = uniqueSorted([
    ...selected.trace.requiredFacts.flatMap((fact) => fact.evidenceIds),
    ...(selectedHistory.new_material_condition === "yes"
      ? selectedHistory.new_condition_evidence_ids
      : []),
  ]);
  return {
    selectionStatus: "selected",
    selectedScenario: {
      scenarioId: selected.trace.scenarioId,
      moneyDistance: selected.scenario.proximityTier,
      proximityRank: selected.trace.ranking.proximityRank,
      proofLevel: selected.trace.proofLevel!,
      capacityFit: selected.trace.capacityFit as Exclude<MoneyNowCapacityFit, "no_fit">,
      modelFit: MONEY_NOW_MODEL_FIT_DEFAULT,
      estimatedTimeToSignalDays: null,
      signalSpeedRank: selected.trace.ranking.signalSpeedRank,
      complexity: complexityLabel(selected.trace.ranking.complexityRank),
      complexityRank: selected.trace.ranking.complexityRank,
      evidenceIds: selectedEvidenceIds,
    },
    candidateTrace: traces,
    rankingTrace: {
      orderedScenarioIds: ranked.map((candidate) => candidate.trace.scenarioId),
      comparisons,
    },
  };
}
