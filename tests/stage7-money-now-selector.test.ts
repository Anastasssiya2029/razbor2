import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  MONEY_NOW_SELECTOR_CONTRACT,
  MONEY_NOW_SELECTOR_CONTRACT_VERSION,
} from "../server/7k/config/money-now-selector-contract.v1";
import {
  MONEY_NOW_FACT_CODES,
  type MoneyNowFactCode,
  type MoneyNowFactConfidence,
} from "../server/7k/config/money-now-fact-extraction.v1";
import {
  MONEY_NOW_HISTORY_MAP,
} from "../server/7k/config/money-now-history-map.v2.2";
import {
  MONEY_NOW_SCENARIO_IDS,
  type MoneyNowScenarioId,
} from "../server/7k/config/money-now.v2.2";
import {
  selectMoneyNowCandidate,
  type MoneyNowSelectorInputV1_1,
} from "../server/7k/money-now-selector";
import type { P01ResultV1_4_2 } from "../server/p01/types";
import { buildMoneyNowHistoryGuardInput } from "../server/p01/money-now-history-adapter";
import { sha256 } from "../server/stage4/hash";
import type { ResolvedTransitionPlan } from "../server/task-resolver/types";
import { MoneyNowSelectorStageError } from "../server/money-now-selector/errors";
import { prepareMoneyNowSelectorInput } from "../server/money-now-selector/preflight";
import { runMoneyNowSelectorStage } from "../server/money-now-selector/runner";
import {
  MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256,
  MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256,
  MONEY_NOW_SELECTOR_STAGE_VERSION,
  type MoneyNowSelectorRepository,
  type MoneyNowSelectorSource,
  type StoredMoneyNowSelection,
} from "../server/money-now-selector/types";
import { unknownMoneyNowFacts } from "./helpers/p01-v1.4";

const ELEMENTS = [
  "authenticity",
  "audience",
  "product_method",
  "sales_technology",
  "funnel",
  "blog",
  "team",
] as const;

function evidence(
  id: string,
  options: {
    timeScope?: P01ResultV1_4_2["evidenceLedger"][number]["time_scope"];
    valence?: P01ResultV1_4_2["evidenceLedger"][number]["valence"];
  } = {},
): P01ResultV1_4_2["evidenceLedger"][number] {
  return {
    id,
    source_field: "project.sales",
    fact: `Evidence ${id}`,
    evidence_type: "current_example",
    time_scope: options.timeScope ?? "current",
    valence: options.valence ?? "positive",
    elements: ["sales_technology"],
    derived_from: [],
  };
}

function defaultHistory(): P01ResultV1_4_2["moneyNowHistory"] {
  return Object.fromEntries(
    MONEY_NOW_SCENARIO_IDS.map((scenarioId) => [
      scenarioId,
      {
        history_status: "not_reported",
        new_material_condition: "not_applicable",
        condition_codes: [],
        summary: null,
        evidence_ids: [],
        new_condition_evidence_ids: [],
        confidence: "low",
      },
    ]),
  ) as P01ResultV1_4_2["moneyNowHistory"];
}

function baseP01(): P01ResultV1_4_2 {
  const current7k = Object.fromEntries(
    ELEMENTS.map((elementId) => [
      elementId,
      {
        score: 2,
        confidence: "medium",
        evidence_cap: 3,
        cap_reason: "Есть текущий пример.",
        matched_level_rule_id: `SR2-${elementId.toUpperCase()}-02`,
        next_level_rule_id: `SR2-${elementId.toUpperCase()}-03`,
        evidence_ids: ["E01"],
        counterevidence_ids: [],
        why_not_higher: "Не доказана повторяемость.",
        contradiction: null,
        historical_asset: null,
        missing_evidence: ["Повторяемый результат"],
      },
    ]),
  ) as unknown as P01ResultV1_4_2["current7k"];
  return {
    promptVersion: "P-01.v1.4.2",
    schemaVersion: "1.4",
    analysisStatus: "ok",
    evidenceLedger: [evidence("E01")],
    current7k,
    businessMap: {
      economics: "Выручка подтверждена.",
      products: "Пакет консультаций.",
      audienceResult: "Эксперты.",
      acquisition: "Рекомендации.",
      sales: "Диагностическая встреча.",
      assets: "Тёплая сеть.",
      operations: "Личная работа.",
      uniqueness: "Авторский подход.",
      experience: {
        strugglesSummary: "Нет стабильности.",
        bestPeriodSummary: "Были продажи.",
        failuresSummary: "Был неудачный тест.",
        attempts: [],
      },
      capacity: "Есть ограниченная ёмкость.",
    },
    moneyChainFacts: [],
    moneyNowSignals: [],
    moneyNowFacts: unknownMoneyNowFacts(),
    moneyNowHistory: defaultHistory(),
    targetIntent: {
      rawBusinessModel: "Пакетная индивидуальная работа",
      normalizedModelFamily: "package_1to1",
      primaryModelFamily: "package_1to1",
      secondaryModelFamilies: [],
      activatedCapabilities: [],
      desiredRoleSummary: null,
      desiredSystemWeeklyHours: null,
      confidence: "medium",
      missing_evidence: [],
    },
    sanityChecks: [],
  };
}

function ensureEvidence(
  result: P01ResultV1_4_2,
  id: string,
  options: Parameters<typeof evidence>[1] = {},
): void {
  if (!result.evidenceLedger.some((item) => item.id === id)) {
    result.evidenceLedger.push(evidence(id, options));
  }
}

function setFact(
  result: P01ResultV1_4_2,
  factCode: MoneyNowFactCode,
  options: {
    state?: "confirmed_true" | "confirmed_false" | "unknown";
    confidence?: MoneyNowFactConfidence;
    evidenceId?: string;
  } = {},
): void {
  const state = options.state ?? "confirmed_true";
  const evidenceId = options.evidenceId ?? (state === "confirmed_false" ? "E03" : "E02");
  if (state !== "unknown") {
    ensureEvidence(result, evidenceId, {
      valence: state === "confirmed_false" ? "negative" : "positive",
    });
  }
  result.moneyNowFacts[factCode] = {
    state,
    confidence: options.confidence ?? "medium",
    summary: state === "unknown" ? null : `${factCode}=${state}`,
    evidence_ids: state === "unknown" ? [] : [evidenceId],
  };
}

function confirmScenario(
  result: P01ResultV1_4_2,
  scenarioId: MoneyNowScenarioId,
  confidence: MoneyNowFactConfidence = "medium",
): void {
  for (const factCode of MONEY_NOW_SELECTOR_CONTRACT.scenarioRequiredFacts[scenarioId]) {
    setFact(result, factCode, { confidence });
  }
}

function selectorInput(result: P01ResultV1_4_2): MoneyNowSelectorInputV1_1 {
  return {
    facts: structuredClone(result.moneyNowFacts),
    history: buildMoneyNowHistoryGuardInput(result.moneyNowHistory),
    evidenceLedger: structuredClone(result.evidenceLedger),
  };
}

function selectedTrace(
  result: ReturnType<typeof selectMoneyNowCandidate>,
  scenarioId: MoneyNowScenarioId,
) {
  return result.candidateTrace.find((candidate) => candidate.scenarioId === scenarioId)!;
}

function plan(): ResolvedTransitionPlan {
  return {
    stageVersion: "task-resolver-stage.v1",
    transitionRegistryVersion: "transitions-70.v1",
    cards: [],
    taskIds: [],
    totalTasks: 0,
    businessValidation: {
      checkpoint_after_order: 1,
      metric_name: "Оплата",
      baseline_value: null,
      target_value: null,
      unit: "оплат",
      target_rule: "Проверить бизнес-сигнал",
      formula: null,
      assumptions: [],
      timeframe_days: 14,
      if_signal_absent: "Пересмотреть гипотезу",
      evidence_ids: ["E01"],
    },
  };
}

function source(result = baseP01()): MoneyNowSelectorSource {
  return {
    analysisRunId: "run-1",
    diagnosticId: "diag-1",
    runStatus: "money_now",
    p01: {
      id: "p01-1",
      promptVersion: "P-01.v1.4.2",
      outputSchemaVersion: "1.4",
      inputHash: "p01-input",
      result,
      failureCode: null,
    },
    taskResolver: {
      id: "task-plan-1",
      p01AnalysisResultId: "p01-1",
      stageVersion: "task-resolver-stage.v1",
      transitionRegistryVersion: "transitions-70.v1",
      deterministicInputHash: "task-input",
      plan: plan(),
      failureCode: null,
      failureMessage: null,
    },
  };
}

class MemoryRepository implements MoneyNowSelectorRepository {
  stored: StoredMoneyNowSelection | null = null;
  updates: Array<{ status: "money_now" | "analysis_failed"; errorCode: string | null }> = [];
  constructor(readonly sourceValue: MoneyNowSelectorSource) {}
  async loadSource() { return this.sourceValue; }
  async loadResult() { return this.stored; }
  async createResult(result: StoredMoneyNowSelection) {
    if (this.stored) return false;
    this.stored = structuredClone(result);
    return true;
  }
  async updateRun(
    _analysisRunId: string,
    update: { status: "money_now" | "analysis_failed"; errorCode: string | null },
  ) {
    this.sourceValue.runStatus = update.status;
    this.updates.push(update);
  }
}

test("1. P-01 v1.4.2 is accepted", async () => {
  const prepared = await prepareMoneyNowSelectorInput(source());
  assert.equal(prepared.selectorInput.history.scenarios.MN01.history_status, "not_reported");
});

test("2. P-01 v1.4 and v1.3 are rejected", async () => {
  for (const version of ["P-01.v1.4", "P-01.v1.3"]) {
    const old = source();
    old.p01.promptVersion = version;
    await assert.rejects(
      prepareMoneyNowSelectorInput(old),
      (error: unknown) =>
        error instanceof MoneyNowSelectorStageError &&
        error.code === "MONEY_NOW_SELECTOR_UNSUPPORTED_P01_VERSION",
    );
  }
});

test("3. selector contract internal version is exactly v1.2", () => {
  assert.equal(MONEY_NOW_SELECTOR_CONTRACT_VERSION, "money-now-selector-contract.v1.2");
  assert.equal(MONEY_NOW_SELECTOR_CONTRACT.version, "money-now-selector-contract.v1.2");
});

test("4. contract SHA/version snapshot is exact", () => {
  const json = readFileSync("server/7k/config/money-now-selector-contract.v1.json");
  const ts = readFileSync("server/7k/config/money-now-selector-contract.v1.ts");
  assert.equal(createHash("sha256").update(json).digest("hex"), MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256);
  assert.equal(createHash("sha256").update(ts).digest("hex"), MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256);
  assert.equal(MONEY_NOW_SELECTOR_STAGE_VERSION, "money-now-selector-stage.v1");
});

test("5. contract keeps exactly 44 facts and 16 prerequisite sets", () => {
  assert.equal(MONEY_NOW_FACT_CODES.length, 44);
  assert.equal(Object.keys(MONEY_NOW_SELECTOR_CONTRACT.scenarioRequiredFacts).length, 16);
});

test("6. all required confirmed_true facts make a scenario eligible", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  assert.equal(selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05").eligible, true);
});

test("7. one unknown prerequisite makes a scenario not eligible", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  setFact(p01, "HAS_WARM_LEADS", { state: "unknown" });
  const trace = selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05");
  assert.equal(trace.eligible, false);
  assert.ok(trace.blockedReasonCodes.includes("PREREQUISITE_UNKNOWN:HAS_WARM_LEADS"));
});

test("8. one confirmed_false prerequisite makes a scenario not eligible", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  setFact(p01, "HAS_WARM_LEADS", { state: "confirmed_false" });
  const trace = selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05");
  assert.equal(trace.eligible, false);
  assert.ok(trace.blockedReasonCodes.includes("PREREQUISITE_CONFIRMED_FALSE:HAS_WARM_LEADS"));
});

test("9. unknown is not converted into a negative stop", () => {
  const trace = selectedTrace(selectMoneyNowCandidate(selectorInput(baseP01())), "MN05");
  assert.ok(trace.blockedReasonCodes.some((code) => code.startsWith("PREREQUISITE_UNKNOWN:")));
  assert.ok(!trace.blockedReasonCodes.some((code) => code.startsWith("PREREQUISITE_CONFIRMED_FALSE:")));
});

test("10. proof level is the minimum among required prerequisites", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN01", "high");
  setFact(p01, "CURRENT_RESULT_CONFIRMED", { confidence: "low" });
  assert.equal(selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN01").proofLevel, 1);
});

test("11. proof mapping comes from the selector contract", () => {
  assert.deepEqual(MONEY_NOW_SELECTOR_CONTRACT.proofLevelMapping, { high: 3, medium: 2, low: 1 });
});

test("12. capacity rules are ordered arrays from the contract", () => {
  for (const rules of Object.values(MONEY_NOW_SELECTOR_CONTRACT.capacityFitRules)) {
    assert.ok(Array.isArray(rules));
    assert.equal("otherwise" in rules[rules.length - 1], true);
  }
});

test("13. overload=true plus unused_capacity=true follows the first ordered rule", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  setFact(p01, "CURRENT_OVERLOAD");
  setFact(p01, "HAS_UNUSED_CAPACITY");
  assert.equal(selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05").capacityFit, "no_fit");
});

test("14. capacity no_fit excludes an otherwise eligible scenario", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  setFact(p01, "CURRENT_OVERLOAD");
  const trace = selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05");
  assert.equal(trace.eligible, true);
  assert.equal(trace.includedInRanking, false);
  assert.ok(trace.blockedReasonCodes.includes("CAPACITY_NO_FIT"));
});

test("15. capacity risk remains a ranking candidate", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  const trace = selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05");
  assert.equal(trace.capacityFit, "risk");
  assert.equal(trace.includedInRanking, true);
});

test("15a. MN08 can use an existing audience under owner overload without adding delivery", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN08");
  setFact(p01, "CURRENT_OVERLOAD");
  const trace = selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN08");
  assert.equal(MONEY_NOW_SELECTOR_CONTRACT.capacityModes.MN08, "uses_existing_flow");
  assert.equal(trace.capacityFit, "risk");
  assert.equal(trace.eligible, true);
  assert.equal(trace.includedInRanking, true);
});

test("16. not_reported history does not block", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  assert.equal(selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05").historyGuardPassed, true);
});

test("17. worked_sustained is not treated as failure", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  ensureEvidence(p01, "E04", { timeScope: "historical_only" });
  p01.moneyNowHistory.MN05 = {
    history_status: "worked_sustained", new_material_condition: "not_applicable",
    condition_codes: [], summary: "Работало устойчиво", evidence_ids: ["E04"],
    new_condition_evidence_ids: [], confidence: "high",
  };
  assert.equal(selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05").historyGuardPassed, true);
});

test("18. worked_temporarily remains distinct and is guarded", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  ensureEvidence(p01, "E04", { timeScope: "historical_only" });
  p01.moneyNowHistory.MN05 = {
    history_status: "worked_temporarily", new_material_condition: "unknown",
    condition_codes: [], summary: "Работало временно", evidence_ids: ["E04"],
    new_condition_evidence_ids: [], confidence: "medium",
  };
  const trace = selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05");
  assert.equal(trace.historyStatus, "worked_temporarily");
  assert.equal(trace.historyGuardPassed, false);
});

test("19. tried_no_sustained_result without a new condition blocks", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  ensureEvidence(p01, "E04", { timeScope: "historical_only" });
  p01.moneyNowHistory.MN05 = {
    history_status: "tried_no_sustained_result", new_material_condition: "no",
    condition_codes: [], summary: "Не сработало устойчиво", evidence_ids: ["E04"],
    new_condition_evidence_ids: [], confidence: "high",
  };
  assert.equal(selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05").historyGuardPassed, false);
});

test("20. tried_no_sustained_result plus unknown remains blocked", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  ensureEvidence(p01, "E04", { timeScope: "historical_only" });
  p01.moneyNowHistory.MN05 = {
    history_status: "tried_no_sustained_result", new_material_condition: "unknown",
    condition_codes: [], summary: "Условие неизвестно", evidence_ids: ["E04"],
    new_condition_evidence_ids: [], confidence: "low",
  };
  assert.equal(selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05").historyGuardPassed, false);
});

test("21. tried_no_sustained_result plus structurally valid condition passes", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  ensureEvidence(p01, "E04", { timeScope: "historical_only" });
  ensureEvidence(p01, "E05");
  setFact(p01, "CONCRETE_PRODUCT_OFFER_EXISTS", { evidenceId: "E05" });
  p01.moneyNowHistory.MN05 = {
    history_status: "tried_no_sustained_result", new_material_condition: "yes",
    condition_codes: ["PRODUCT"], summary: "Появился новый продукт", evidence_ids: ["E04"],
    new_condition_evidence_ids: ["E05"], confidence: "high",
  };
  assert.equal(selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05").historyGuardPassed, true);
});

test("22. unclear remains conservative unknown, not failure or success", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  ensureEvidence(p01, "E04", { timeScope: "historical_only" });
  p01.moneyNowHistory.MN05 = {
    history_status: "unclear", new_material_condition: "unknown",
    condition_codes: [], summary: "Результат неясен", evidence_ids: ["E04"],
    new_condition_evidence_ids: [], confidence: "low",
  };
  const trace = selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05");
  assert.equal(trace.historyStatus, "unclear");
  assert.equal(trace.historyGuardPassed, true);
});

test("23. SEQUENCE alone cannot unblock history guard", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  ensureEvidence(p01, "E04", { timeScope: "historical_only" });
  ensureEvidence(p01, "E05");
  setFact(p01, "NEXT_STEP_LEAK_CONFIRMED", { evidenceId: "E05" });
  p01.moneyNowHistory.MN05 = {
    history_status: "tried_no_sustained_result", new_material_condition: "yes",
    condition_codes: ["SEQUENCE"], summary: "Изменилась последовательность", evidence_ids: ["E04"],
    new_condition_evidence_ids: ["E05"], confidence: "medium",
  };
  assert.equal(selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05").historyGuardPassed, false);
});

test("24. material condition evidence remains traceable to ledger and mapped fact", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  ensureEvidence(p01, "E04", { timeScope: "historical_only" });
  ensureEvidence(p01, "E05");
  setFact(p01, "PRODUCT_CLARITY_CONFIRMED", { evidenceId: "E05" });
  p01.moneyNowHistory.MN05 = {
    history_status: "tried_no_sustained_result", new_material_condition: "yes",
    condition_codes: ["PRODUCT"], summary: "Продукт уточнён", evidence_ids: ["E04"],
    new_condition_evidence_ids: ["E05"], confidence: "high",
  };
  const trace = selectedTrace(selectMoneyNowCandidate(selectorInput(p01)), "MN05");
  assert.deepEqual(trace.historyEvidenceIds, ["E04", "E05"]);
  assert.equal(trace.historyGuardPassed, true);
});

test("25. proximity beats stronger proof farther from payment", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05", "low");
  confirmScenario(p01, "MN07", "high");
  assert.equal(selectMoneyNowCandidate(selectorInput(p01)).selectedScenario?.scenarioId, "MN05");
});

test("26. equal proximity is decided by proof", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN01", "low");
  confirmScenario(p01, "MN02", "high");
  const result = selectMoneyNowCandidate(selectorInput(p01));
  assert.equal(result.selectedScenario?.scenarioId, "MN02");
  assert.equal(selectedTrace(result, "MN01").ranking.decidingCriterion, "proof_level");
});

test("27. then faster signal decides", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN04", "medium");
  confirmScenario(p01, "MN07", "medium");
  const result = selectMoneyNowCandidate(selectorInput(p01));
  assert.equal(result.selectedScenario?.scenarioId, "MN07");
  assert.equal(selectedTrace(result, "MN04").ranking.decidingCriterion, "estimated_time_to_signal");
});

test("28. then lower complexity decides", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN04", "medium");
  confirmScenario(p01, "MN08", "medium");
  const result = selectMoneyNowCandidate(selectorInput(p01));
  assert.equal(result.selectedScenario?.scenarioId, "MN04");
  assert.equal(selectedTrace(result, "MN08").ranking.decidingCriterion, "complexity");
});

test("29. stable scenario ID is the final deterministic tie-break", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN10", "medium");
  confirmScenario(p01, "MN11", "medium");
  const result = selectMoneyNowCandidate(selectorInput(p01));
  assert.equal(result.selectedScenario?.scenarioId, "MN10");
  assert.equal(selectedTrace(result, "MN11").ranking.decidingCriterion, "stable_scenario_id");
});

test("30. P-02 priority has zero effect", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  const input = selectorInput(p01);
  const noisy = { ...input, p02Priority: "team" } as MoneyNowSelectorInputV1_1;
  assert.deepEqual(selectMoneyNowCandidate(noisy), selectMoneyNowCandidate(input));
});

test("31. Task Resolver plan has zero effect on selector input/hash", async () => {
  const first = source();
  const second = source();
  second.taskResolver!.plan = { ...plan(), totalTasks: 99 };
  const [left, right] = await Promise.all([
    prepareMoneyNowSelectorInput(first),
    prepareMoneyNowSelectorInput(second),
  ]);
  assert.equal(left.selectorInputHash, right.selectorInputHash);
  assert.equal(left.deterministicInputHash, right.deterministicInputHash);
  assert.notEqual(left.taskResolverPlanHash, right.taskResolverPlanHash);
});

test("32. Target gap and archetype have zero effect", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  const input = selectorInput(p01);
  const noisy = { ...input, targetGap: { team: 10 }, archetype: "ruler" } as MoneyNowSelectorInputV1_1;
  assert.deepEqual(selectMoneyNowCandidate(noisy), selectMoneyNowCandidate(input));
});

test("33. three competing candidates produce deterministic ordered trace", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  confirmScenario(p01, "MN07");
  confirmScenario(p01, "MN10");
  const first = selectMoneyNowCandidate(selectorInput(p01));
  const second = selectMoneyNowCandidate(selectorInput(p01));
  assert.deepEqual(first, second);
  assert.deepEqual(first.rankingTrace.orderedScenarioIds.slice(0, 3), ["MN05", "MN07", "MN10"]);
  assert.equal(first.rankingTrace.comparisons.length >= 2, true);
});

test("34. no candidates returns valid no_eligible_scenario", () => {
  const result = selectMoneyNowCandidate(selectorInput(baseP01()));
  assert.equal(result.selectionStatus, "no_eligible_scenario");
  assert.equal(result.selectedScenario, null);
});

test("35. no_eligible_scenario stays valid and routes to the deterministic P-03 skip path", async () => {
  const repository = new MemoryRepository(source());
  const executed = await runMoneyNowSelectorStage("run-1", { repository, createId: () => "mn-1" });
  assert.equal(executed.status, "money_now");
  assert.equal(executed.result.snapshot?.selectionStatus, "no_eligible_scenario");
  assert.equal(executed.nextStep, "/api/analysis-runs/run-1/p03");
});

test("36. selected snapshot is immutable and is the source for future P-03", async () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  const repository = new MemoryRepository(source(p01));
  const first = await runMoneyNowSelectorStage("run-1", { repository, createId: () => "mn-1" });
  const second = await runMoneyNowSelectorStage("run-1", { repository, createId: () => "mn-2" });
  assert.equal(first.result.id, "mn-1");
  assert.equal(second.result.id, "mn-1");
  assert.equal(second.idempotentReplay, true);
  assert.equal(first.nextStep, "/api/analysis-runs/run-1/p03");
});

test("37. identical P-01 and resource versions replay idempotently", async () => {
  const repository = new MemoryRepository(source());
  await runMoneyNowSelectorStage("run-1", { repository, createId: () => "mn-1" });
  const replay = await runMoneyNowSelectorStage("run-1", { repository, createId: () => "mn-2" });
  assert.equal(replay.idempotentReplay, true);
});

test("38. changed upstream P-01 returns MONEY_NOW_SELECTOR_VERSION_CONFLICT", async () => {
  const repository = new MemoryRepository(source());
  await runMoneyNowSelectorStage("run-1", { repository, createId: () => "mn-1" });
  repository.sourceValue.p01.result!.businessMap.sales = "Changed immutable upstream";
  await assert.rejects(
    runMoneyNowSelectorStage("run-1", { repository }),
    (error: unknown) =>
      error instanceof MoneyNowSelectorStageError &&
      error.code === "MONEY_NOW_SELECTOR_VERSION_CONFLICT",
  );
});

test("39. successful selected result keeps lifecycle money_now", async () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  const repository = new MemoryRepository(source(p01));
  const executed = await runMoneyNowSelectorStage("run-1", { repository, createId: () => "mn-1" });
  assert.equal(executed.status, "money_now");
  assert.equal(repository.updates.at(-1)?.status, "money_now");
});

test("40. invariant failure persists structured failure and moves to analysis_failed", async () => {
  const p01 = baseP01();
  p01.evidenceLedger = [];
  const repository = new MemoryRepository(source(p01));
  const executed = await runMoneyNowSelectorStage("run-1", { repository, createId: () => "mn-failed" });
  assert.equal(executed.status, "analysis_failed");
  assert.ok(executed.result.failure);
  assert.equal(repository.updates.at(-1)?.status, "analysis_failed");
});

test("41. Stage 7 has zero OpenRouter or LLM calls", () => {
  const sources = [
    readFileSync("server/7k/money-now-selector.ts", "utf8"),
    readFileSync("server/money-now-selector/runner.ts", "utf8"),
    readFileSync("server/money-now-selector/preflight.ts", "utf8"),
  ].join("\n");
  assert.doesNotMatch(sources, /openrouter|provider\.complete|runP0[1-4]/iu);
});

test("42. Stage 7 does not invoke P-03 or P-04", () => {
  const runner = readFileSync("server/money-now-selector/runner.ts", "utf8");
  assert.doesNotMatch(runner, /import .*p03|import .*p04|runP03|runP04/iu);
  assert.match(runner, /\/p03`/u);
});

test("43. stages 1–6 remain isolated and Stage 7 uses no legacy signals", async () => {
  const pure = readFileSync("server/7k/money-now-selector.ts", "utf8");
  const preflight = readFileSync("server/money-now-selector/preflight.ts", "utf8");
  assert.doesNotMatch(pure, /MoneyNowSignalCode|moneyNowSignals|eligibilityAllOf|capacityDemand/u);
  const prepared = await prepareMoneyNowSelectorInput(source());
  assert.deepEqual(Object.keys(prepared.selectorInput).sort(), ["evidenceLedger", "facts", "history"]);
  assert.doesNotMatch(preflight, /targetGap|archetype|p02Priority/u);
});

test("evidence trace rejects IDs absent from persisted P-01 ledger", () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  p01.moneyNowFacts.HAS_WARM_LEADS.evidence_ids = ["E99"];
  assert.throws(
    () => selectMoneyNowCandidate(selectorInput(p01)),
    (error: unknown) => error instanceof Error && error.message.includes("E99"),
  );
});

test("stored resource versions and hashes are deterministic", async () => {
  const p01 = baseP01();
  confirmScenario(p01, "MN05");
  const repository = new MemoryRepository(source(p01));
  const executed = await runMoneyNowSelectorStage("run-1", { repository, createId: () => "mn-1" });
  assert.equal(executed.result.stageVersion, "money-now-selector-stage.v1");
  assert.equal(executed.result.selectorContractVersion, "money-now-selector-contract.v1.2");
  assert.equal(executed.result.p01ResultHash, await sha256(p01));
});

test("history keys stay lossless for all MN01–MN16", () => {
  const history = buildMoneyNowHistoryGuardInput(defaultHistory());
  assert.deepEqual(Object.keys(history.scenarios), [...MONEY_NOW_SCENARIO_IDS]);
  for (const scenarioId of MONEY_NOW_SCENARIO_IDS) {
    assert.equal(history.scenarios[scenarioId].history_key, MONEY_NOW_HISTORY_MAP.scenarios[scenarioId].historyKey);
  }
});
