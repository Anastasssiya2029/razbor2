import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertKnownPrescriptionHistoryTags,
  assertMoneyNowPrescriptionRegistryIntegrity,
  derivePrescriptionSupportingElements,
  getMoneyNowScenarioPrescriptionRule,
  MONEY_NOW_PRESCRIPTION_CAUSE_CODES,
  MONEY_NOW_PRESCRIPTION_INTEGRITY,
  MONEY_NOW_PRESCRIPTION_REGISTRY,
  MONEY_NOW_RESERVED_CAUSE_CODES,
  MONEY_NOW_RESERVED_INTERVENTION_CODES,
  MONEY_NOW_SELECTABLE_CAUSE_CODES,
  MONEY_NOW_SELECTABLE_INTERVENTION_CODES,
} from "../server/7k/config/money-now-prescription-rules.v1";
import { MONEY_NOW_SELECTOR_CONTRACT } from "../server/7k/config/money-now-selector-contract.v1";
import { MONEY_NOW_SCENARIO_IDS, MONEY_NOW_SCENARIOS, type MoneyNowScenarioId } from "../server/7k/config/money-now.v2.2";
import { SEVEN_K_ELEMENT_IDS } from "../server/7k/types";
import { selectMoneyNowCandidate } from "../server/7k/money-now-selector";
import {
  MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256,
  MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256,
  type MoneyNowSelectionSnapshot,
  type StoredMoneyNowSelection,
} from "../server/money-now-selector/types";
import { buildMoneyNowHistoryGuardInput } from "../server/p01/money-now-history-adapter";
import type { P01ResultV1_4_2 } from "../server/p01/types";
import { sha256 } from "../server/stage4/hash";
import { P03Error } from "../server/p03/errors";
import { prepareP03Input, type P03SelectedPreparedInput } from "../server/p03/projections";
import { buildP03SystemPrompt } from "../server/p03/request";
import { buildP03BackendMetrics } from "../server/p03/metrics";
import { authorizeP03PublicRequest } from "../server/p03/public-guard";
import { P03RunExecutionError, runP03MoneyNowPrescription } from "../server/p03/runner";
import { runP03Stage } from "../server/p03/stage-runner";
import type { P03Repository, P03Source, StoredP03Result } from "../server/p03/stage-types";
import {
  P03_LOCKED_TEASER,
  type P03Provider,
  type P03ProviderRequest,
  type P03ProviderResponse,
  type P03ResultV1_5,
} from "../server/p03/types";
import {
  P03_PROMPT_SHA256,
  P03_PROMPT_VERSION,
  P03_SYSTEM_PROMPT,
} from "../server/7k/prompts/p03.v1.5";
import {
  canonicalizeP03SupportingElements,
  finalizeAndValidateP03Output,
  P03InvariantError,
  validateP03Invariants,
  validateP03Schema,
} from "../server/p03/validation";
import { unknownMoneyNowFacts } from "./helpers/p01-v1.4";

function evidence(
  id: string,
  fact: string,
  options: Partial<P01ResultV1_4_2["evidenceLedger"][number]> = {},
): P01ResultV1_4_2["evidenceLedger"][number] {
  return {
    id,
    source_field: "project.sales",
    fact,
    evidence_type: "current_example",
    time_scope: "current",
    valence: "neutral",
    elements: [...SEVEN_K_ELEMENT_IDS],
    derived_from: [],
    ...options,
  };
}

function history(): P01ResultV1_4_2["moneyNowHistory"] {
  return Object.fromEntries(MONEY_NOW_SCENARIO_IDS.map((scenarioId) => [scenarioId, {
    history_status: "not_reported",
    new_material_condition: "not_applicable",
    condition_codes: [],
    summary: null,
    evidence_ids: [],
    new_condition_evidence_ids: [],
    confidence: "low",
  }])) as unknown as P01ResultV1_4_2["moneyNowHistory"];
}

function p01(selectedScenario: MoneyNowScenarioId | null = "MN14"): P01ResultV1_4_2 {
  const ledger = [
    evidence("E01", "Текущая бизнес-система описана по каждому элементу 7К."),
    evidence("E02", "За текущий месяц было 10 целевых встреч и одно предложение дошло до оплаты.", { evidence_type: "metric_result" }),
    evidence("E05", "Часть встреч проходит с людьми без подходящей задачи и готовности покупать."),
    evidence("E06", "Из 10 встреч произошла 1 оплата — 10 процентов.", { evidence_type: "metric_result" }),
    evidence("E07", "На бесплатном разборе клиент уже получает существенную часть решения и готовый план."),
    evidence("E08", "Эксперт говорит: мне страшно назвать эту цену, кажется, я столько не стою.", { elements: ["authenticity", "sales_technology"] }),
    evidence("E09", "Ранее тестировали квалификацию, результата не удержали.", { source_field: "experience.failures", time_scope: "historical_only" }),
    evidence("E10", "Сейчас перед встречей появилась обязательная анкета с тремя критериями и ответственным за проверку."),
  ];
  const current7k = Object.fromEntries(SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, {
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
  }])) as unknown as P01ResultV1_4_2["current7k"];
  const facts = unknownMoneyNowFacts();
  if (selectedScenario) {
    for (const factCode of MONEY_NOW_SELECTOR_CONTRACT.scenarioRequiredFacts[selectedScenario]) {
      facts[factCode] = {
        state: "confirmed_true",
        confidence: "medium",
        summary: `${factCode} подтверждён`,
        evidence_ids: ["E02"],
      };
    }
  }
  return {
    promptVersion: "P-01.v1.4.2",
    schemaVersion: "1.4",
    analysisStatus: "ok",
    evidenceLedger: ledger,
    current7k,
    businessMap: {
      economics: "10 встреч, одна оплата.",
      products: "Пакет консультаций.",
      audienceResult: "Эксперты с задачей продаж.",
      acquisition: "Личные приглашения.",
      sales: "Бесплатный разбор, затем предложение.",
      assets: "Тёплая сеть.",
      operations: "Личная работа.",
      uniqueness: "Авторская диагностика.",
      experience: {
        strugglesSummary: "Не получается стабильно продавать.",
        bestPeriodSummary: "Личные приглашения давали оплаты.",
        failuresSummary: "Квалификация не дала устойчивого результата.",
        attempts: [{
          attempt: "Вводили квалификацию перед встречей",
          actual_result: "Результат не удержался",
          client_explanation: "Не хватило последовательности",
          time_scope: "historical_only",
          evidence_ids: ["E09"],
        }],
      },
      capacity: "Есть место для двух клиентов.",
    },
    moneyChainFacts: [{
      stage: "payment",
      summary: "Одна оплата из десяти встреч",
      value: 1,
      denominator: 10,
      conversionPct: 10,
      period: "month",
      evidence_ids: ["E06"],
    }],
    moneyNowSignals: [],
    moneyNowFacts: facts,
    moneyNowHistory: history(),
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

async function source(selectedScenario: MoneyNowScenarioId | null = "MN14"): Promise<P03Source> {
  const result = p01(selectedScenario);
  const decision = selectMoneyNowCandidate({
    facts: structuredClone(result.moneyNowFacts),
    history: buildMoneyNowHistoryGuardInput(result.moneyNowHistory),
    evidenceLedger: structuredClone(result.evidenceLedger),
  });
  const snapshot: MoneyNowSelectionSnapshot = {
    stageVersion: "money-now-selector-stage.v1",
    selectorContractVersion: "money-now-selector-contract.v1.2",
    selectorContractJsonSha256: MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256,
    selectorContractTsSha256: MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256,
    businessMethodologyVersion: "money-now.v2.2",
    factExtractionVersion: "money-now-fact-extraction.v1",
    p01PromptVersion: "P-01.v1.4.2",
    selectionStatus: decision.selectionStatus,
    selectedScenario: decision.selectedScenario,
    candidateTrace: decision.candidateTrace,
    rankingTrace: decision.rankingTrace,
    selectorInputHash: "selector-input",
  };
  const storedSelection: StoredMoneyNowSelection = {
    id: "mn-selection-1",
    diagnosticId: "diag-1",
    analysisRunId: "run-1",
    p01AnalysisResultId: "p01-1",
    p01ResultHash: await sha256(result),
    taskResolverPlanId: "task-1",
    taskResolverPlanHash: "task-hash",
    stageVersion: "money-now-selector-stage.v1",
    selectorContractVersion: "money-now-selector-contract.v1.2",
    selectorContractJsonSha256: MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256,
    selectorContractTsSha256: MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256,
    businessMethodologyVersion: "money-now.v2.2",
    factExtractionVersion: "money-now-fact-extraction.v1",
    selectorInputHash: "selector-input",
    deterministicInputHash: "selector-deterministic",
    selectorInput: null,
    snapshot,
    startedAt: "2026-08-18T10:00:00.000Z",
    completedAt: "2026-08-18T10:00:01.000Z",
    failure: null,
  };
  return {
    analysisRunId: "run-1",
    diagnosticId: "diag-1",
    runStatus: "money_now",
    p01: {
      id: "p01-1",
      promptVersion: "P-01.v1.4.2",
      outputSchemaVersion: "1.4",
      result,
      failureCode: null,
    },
    moneyNowSelection: storedSelection,
  };
}

function validOutput(input: P03SelectedPreparedInput): P03ResultV1_5 {
  return {
    promptVersion: "P-03.v1.5",
    schemaVersion: "1.5",
    analysisStatus: "ok",
    selectedScenario: {
      scenario_id: input.selectedScenario.scenario_id,
      scenario_title: input.selectedScenario.scenario_title,
    },
    diagnosis: {
      observed_fact: "Часть встреч нецелевая, а на бесплатном разборе выдаётся готовый план.",
      money_leak: "Встречи расходуют ресурс, но редко доходят до оплаты.",
      primary_cause_code: "UNQUALIFIED_MEETINGS",
      cause_statement: "До встречи не отделены люди, которым продукт сейчас подходит.",
      contributing_cause_codes: ["OVERCONSULTING_FREE_VALUE"],
      evidence_ids: ["E05", "E07"],
      counterevidence_ids: [],
      confidence: "medium",
      missing_evidence: [],
    },
    businessPrescription: {
      client_task_title: "Ввести квалификацию до продающей встречи",
      coach_explanation: "Сейчас часть встреч начинается без проверки задачи и готовности клиента. Сначала отделите подходящих людей, а на бесплатном контакте оставьте диагностику и следующий шаг вместо готового решения.",
      precondition: null,
      interventions: [
        { intervention_code: "INT_QUALIFY_BEFORE_SALE", personalized_action: "Зафиксировать три критерия целевого клиента до встречи.", why_needed: "Так встреча начинается только с подходящим запросом." },
        { intervention_code: "INT_LIMIT_FREE_CONSULTING", personalized_action: "Оставить на бесплатной встрече диагностику и выбор решения.", why_needed: "Готовый план не должен заменять платную работу." },
      ],
      expected_change: "Встречи станут целевыми, а следующий платный шаг — различимым.",
      do_not_scale_yet: ["Не увеличивать трафик до проверки нового перехода."],
      zero_step: null,
    },
    interventionHistoryReview: [
      {
        intervention_code: "INT_QUALIFY_BEFORE_SALE",
        match_status: "matched",
        matched_attempt_evidence_ids: ["E09"],
        new_condition_status: "confirmed",
        new_condition_evidence_ids: ["E10"],
        conclusion: "clear_to_test",
      },
      {
        intervention_code: "INT_LIMIT_FREE_CONSULTING",
        match_status: "no_match",
        matched_attempt_evidence_ids: [],
        new_condition_status: "not_applicable",
        new_condition_evidence_ids: [],
        conclusion: "clear_to_test",
      },
    ],
    targetMetric: {
      metric_name: "Оплаты после продающих встреч",
      baseline_metric_code: "money_chain.0.payment.value",
      baseline_value: 1,
      target_metric_code: null,
      target_value: null,
      unit: null,
      target_rule: "Зафиксировать, меняется ли число оплат после квалификации.",
      source: "client_fact",
      assumptions: [],
      evidence_ids: ["E06"],
    },
    test30d: {
      audience: "Эксперты с подтверждённой задачей продаж.",
      offer: "Пакет консультаций.",
      asset: "Тёплая сеть и текущие входящие диалоги.",
      path: "Квалификация → диагностическая встреча → предложение → решение.",
      actions: [
        { intervention_code: "INT_QUALIFY_BEFORE_SALE", action: "Проверять три критерия перед встречей." },
        { intervention_code: "INT_LIMIT_FREE_CONSULTING", action: "Не выдавать законченный план бесплатно." },
      ],
      repetitions: null,
      primary_metric: "Оплаты после продающих встреч",
      baseline: 1,
      target_signal: "Появляется наблюдаемое изменение оплат при той же структуре учёта.",
      review_day: 30,
      decision_rule: "Если сигнал не появился, проверить причину заново и не масштабировать поток.",
    },
    revenueScenario: null,
    supportingElements: [],
    lockedTeaser: P03_LOCKED_TEASER,
    sanityChecks: [],
  };
}

function blockedOutput(input: P03SelectedPreparedInput): P03ResultV1_5 {
  const value = validOutput(input);
  value.analysisStatus = "blocked_by_insufficient_evidence";
  value.diagnosis.primary_cause_code = null;
  value.diagnosis.cause_statement = null;
  value.diagnosis.contributing_cause_codes = [];
  value.diagnosis.evidence_ids = [];
  value.diagnosis.missing_evidence = ["Нужна запись или разбор нескольких встреч."];
  value.businessPrescription = null;
  value.interventionHistoryReview = [];
  value.targetMetric = null;
  value.test30d = null;
  value.supportingElements = [];
  return value;
}

function blockedRepeatOutput(input: P03SelectedPreparedInput): P03ResultV1_5 {
  const value = validOutput(input);
  value.analysisStatus = "blocked_by_inconsistency";
  value.businessPrescription = null;
  value.targetMetric = null;
  value.test30d = null;
  value.supportingElements = [];
  value.interventionHistoryReview = [{
    intervention_code: "INT_QUALIFY_BEFORE_SALE",
    match_status: "matched",
    matched_attempt_evidence_ids: ["E09"],
    new_condition_status: "unknown",
    new_condition_evidence_ids: [],
    conclusion: "blocked_repeat_without_new_condition",
  }];
  value.sanityChecks = [];
  return value;
}

function blockedUnclearHistoryOutput(input: P03SelectedPreparedInput): P03ResultV1_5 {
  const value = blockedOutput(input);
  value.interventionHistoryReview = [{
    intervention_code: "INT_QUALIFY_BEFORE_SALE",
    match_status: "unclear",
    matched_attempt_evidence_ids: ["E09"],
    new_condition_status: "unknown",
    new_condition_evidence_ids: [],
    conclusion: "blocked_insufficient_history_evidence",
  }];
  return value;
}

class QueueProvider implements P03Provider {
  readonly provider = "mock";
  readonly model = "mock-p03";
  readonly requests: P03ProviderRequest[] = [];
  constructor(private readonly queue: Array<unknown | Error>) {}
  async complete(request: P03ProviderRequest): Promise<P03ProviderResponse> {
    this.requests.push(request);
    const value = this.queue.shift();
    if (value instanceof Error) throw value;
    return {
      text: typeof value === "string" ? value : JSON.stringify(value),
      rawResponse: { attempt: this.requests.length, private: "server-only" },
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, costUsd: 0.001 },
    };
  }
}

class MemoryRepository implements P03Repository {
  stored: StoredP03Result | null = null;
  updates: Array<{ status: "writing_report" | "analysis_failed"; errorCode: string | null }> = [];
  constructor(readonly sourceValue: P03Source) {}
  async loadSource() { return this.sourceValue; }
  async loadResult() { return this.stored; }
  async createResult(result: StoredP03Result) {
    if (this.stored) return false;
    this.stored = structuredClone(result);
    return true;
  }
  async updateRun(_id: string, update: { status: "writing_report" | "analysis_failed"; errorCode: string | null }) {
    this.sourceValue.runStatus = update.status;
    this.updates.push(update);
  }
}

test("prescription registry has 15 causes, 21 selectable interventions and all MN01–MN16", () => {
  assert.deepEqual(assertMoneyNowPrescriptionRegistryIntegrity(), MONEY_NOW_PRESCRIPTION_INTEGRITY);
  assert.equal(MONEY_NOW_PRESCRIPTION_CAUSE_CODES.length, 15);
  assert.equal(MONEY_NOW_SELECTABLE_CAUSE_CODES.length, 14);
  assert.deepEqual(MONEY_NOW_RESERVED_CAUSE_CODES, ["CAPACITY_BOTTLENECK"]);
  assert.equal(MONEY_NOW_SELECTABLE_INTERVENTION_CODES.length, 21);
  assert.deepEqual(MONEY_NOW_RESERVED_INTERVENTION_CODES, ["INT_FREE_CAPACITY"]);
  assert.deepEqual(Object.keys(MONEY_NOW_PRESCRIPTION_REGISTRY.scenarioRules).sort(), [...MONEY_NOW_SCENARIO_IDS].sort());
});

test("every primary cause has a matrix entry and every matrix code exists", () => {
  const interventions = new Set(Object.keys(MONEY_NOW_PRESCRIPTION_REGISTRY.interventions));
  for (const scenarioId of MONEY_NOW_SCENARIO_IDS) {
    const rule = getMoneyNowScenarioPrescriptionRule(scenarioId);
    for (const cause of rule.allowedPrimaryCauses) {
      const codes = MONEY_NOW_PRESCRIPTION_REGISTRY.scenarioCauseInterventions[scenarioId][cause];
      assert.ok(codes?.length);
      assert.ok(codes!.every((code) => interventions.has(code)));
    }
  }
});

test("MN16 uses UNDERUSED_PROVEN_MECHANISM and the new repetition intervention", () => {
  const rule = getMoneyNowScenarioPrescriptionRule("MN16");
  assert.deepEqual(rule.allowedPrimaryCauses, ["UNDERUSED_PROVEN_MECHANISM"]);
  assert.deepEqual(MONEY_NOW_PRESCRIPTION_REGISTRY.scenarioCauseInterventions.MN16.UNDERUSED_PROVEN_MECHANISM, ["INT_INCREASE_PROVEN_REPETITIONS"]);
  assert.ok(!rule.allowedPrimaryCauses.includes("PROVEN_MECHANISM_INACTIVE"));
});

test("MN16 P-03 output accepts only the new cause and preserves the scenario anchor", async () => {
  const prepared = await prepareP03Input(await source("MN16")) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  value.diagnosis.primary_cause_code = "UNDERUSED_PROVEN_MECHANISM";
  value.diagnosis.contributing_cause_codes = [];
  value.diagnosis.evidence_ids = ["E02"];
  value.businessPrescription!.interventions = [{
    intervention_code: "INT_INCREASE_PROVEN_REPETITIONS",
    personalized_action: "Повторять подтверждённую рабочую связку в пределах свободной ёмкости.",
    why_needed: "Механизм уже доказан, но используется реже доступной мощности.",
  }];
  value.interventionHistoryReview = [{
    intervention_code: "INT_INCREASE_PROVEN_REPETITIONS",
    match_status: "no_match",
    matched_attempt_evidence_ids: [],
    new_condition_status: "not_applicable",
    new_condition_evidence_ids: [],
    conclusion: "clear_to_test",
  }];
  value.test30d!.actions = [{
    intervention_code: "INT_INCREASE_PROVEN_REPETITIONS",
    action: "Повторять только доказанное действие и фиксировать оплаты.",
  }];
  assert.doesNotThrow(() => finalizeAndValidateP03Output(value, prepared));
  value.diagnosis.primary_cause_code = "PROVEN_MECHANISM_INACTIVE";
  assert.throws(() => finalizeAndValidateP03Output(value, prepared), P03InvariantError);
});

test("supporting elements are the exact canonical union and unknown history tags reject", () => {
  assert.deepEqual(
    derivePrescriptionSupportingElements(["INT_QUALIFY_BEFORE_SALE", "INT_LIMIT_FREE_CONSULTING"]),
    ["audience", "sales_technology", "funnel"],
  );
  assert.doesNotThrow(() => assertKnownPrescriptionHistoryTags(["qualification"]));
  assert.throws(() => assertKnownPrescriptionHistoryTags(["made_up_tag"]));
});

test("test30d primary metric is canonicalized to the validated target metric label", async () => {
  const prepared = await prepareP03Input(await source("MN14")) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  value.test30d!.primary_metric = "Другая формулировка того же показателя";

  const normalized = finalizeAndValidateP03Output(value, prepared);

  assert.equal(normalized.test30d!.primary_metric, normalized.targetMetric!.metric_name);
});

test("qualitative target metric cannot retain model-invented numeric values", async () => {
  const prepared = await prepareP03Input(await source("MN14")) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  value.targetMetric!.source = "qualitative_rule";
  value.targetMetric!.baseline_metric_code = "money_chain.0.payment.value";
  value.targetMetric!.baseline_value = 999;
  value.targetMetric!.target_metric_code = "money_chain.target.payment.value";
  value.targetMetric!.target_value = 1000;
  value.targetMetric!.unit = "count";
  value.test30d!.baseline = 999;

  const normalized = finalizeAndValidateP03Output(value, prepared);

  assert.equal(normalized.targetMetric!.baseline_metric_code, null);
  assert.equal(normalized.targetMetric!.baseline_value, null);
  assert.equal(normalized.targetMetric!.target_metric_code, null);
  assert.equal(normalized.targetMetric!.target_value, null);
  assert.equal(normalized.targetMetric!.unit, null);
  assert.equal(normalized.test30d!.baseline, null);
});

test("old text-only intervention rules are removed as a second source of truth", () => {
  const legacy = readFileSync("server/7k/config/money-now.v2.2.ts", "utf8");
  assert.doesNotMatch(legacy, /MONEY_NOW_INTERVENTION_RULES|MONEY_NOW_CAUSE_CODES/u);
});

test("P-03 prompt and schema are versioned as v1.5 without legacy schema symbols", () => {
  assert.equal(P03_PROMPT_VERSION, "P-03.v1.5");
  assert.equal(P03_PROMPT_SHA256, "f70793b9bba665275fb3eaa95f588b77aa2dfb5b873ddcb7bced454910bc3e88");
  assert.equal(createHash("sha256").update(P03_SYSTEM_PROMPT).digest("hex"), P03_PROMPT_SHA256);
  assert.match(P03_SYSTEM_PROMPT, /P03_OUTPUT_SCHEMA_V1_5/u);
  assert.doesNotMatch(P03_SYSTEM_PROMPT, /P03_OUTPUT_SCHEMA_V1_[34]|Canonical codes:|CAPACITY_BOTTLENECK/u);
});

test("reserved intervention and cause are absent from the scenario-specific P-03 projection", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  assert.doesNotMatch(JSON.stringify(prepared.interventionLibrary), /INT_FREE_CAPACITY/u);
  assert.doesNotMatch(JSON.stringify(prepared.prescriptionRules), /CAPACITY_BOTTLENECK/u);
});

test("backend metrics assign baseline/reference roles and never create an implicit target", () => {
  const metrics = buildP03BackendMetrics(p01().moneyChainFacts);
  assert.deepEqual(metrics.map((metric) => [metric.metric_code, metric.role]), [
    ["money_chain.0.payment.value", "baseline"],
    ["money_chain.0.payment.denominator", "reference"],
    ["money_chain.0.payment.conversion_pct", "baseline"],
  ]);
  assert.ok(metrics.every((metric) => metric.role !== "target"));
});

test("P03_CONTEXT contains exact approved keys and no alternatives or strategic pipeline", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  assert.deepEqual(Object.keys(prepared.context).sort(), [
    "businessMap", "current7k", "evidenceLedger", "moneyChainFacts",
    "selectedCandidateTrace", "selectedScenarioFacts", "selectedScenarioHistory",
  ].sort());
  assert.deepEqual(Object.keys(prepared.context.selectedScenarioFacts).sort(), [...MONEY_NOW_SELECTOR_CONTRACT.scenarioRequiredFacts.MN14].sort());
  const prompt = buildP03SystemPrompt(prepared);
  assert.doesNotMatch(JSON.stringify(prepared.context), /rankingTrace|orderedScenarioIds|targetScores|archetype|Task Resolver|products_method/u);
  assert.doesNotMatch(prompt, /"rankingTrace"|"orderedScenarioIds"|"targetScores"|"products_method"/u);
  assert.match(prompt, /"scenario_id":"MN14"/u);
});

test("selected scenario exact echo validates and another MN scenario rejects", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const valid = finalizeAndValidateP03Output(validOutput(prepared), prepared);
  assert.equal(valid.selectedScenario.scenario_id, "MN14");
  const changed = validOutput(prepared);
  changed.selectedScenario.scenario_id = "MN13";
  assert.throws(() => finalizeAndValidateP03Output(changed, prepared), P03InvariantError);
});

test("MN14 supports two evidenced causes and ordered allowed interventions", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const valid = finalizeAndValidateP03Output(validOutput(prepared), prepared);
  assert.deepEqual(valid.diagnosis.contributing_cause_codes, ["OVERCONSULTING_FREE_VALUE"]);
  assert.deepEqual(valid.businessPrescription!.interventions.map((item) => item.intervention_code), [
    "INT_QUALIFY_BEFORE_SALE", "INT_LIMIT_FREE_CONSULTING",
  ]);
  assert.deepEqual(valid.supportingElements.map((item) => item.element_id), ["audience", "sales_technology", "funnel"]);
});

test("cause precedence rejects NO_SALES_STRUCTURE ahead of evidenced UNQUALIFIED_MEETINGS", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  value.diagnosis.primary_cause_code = "NO_SALES_STRUCTURE";
  value.diagnosis.contributing_cause_codes = ["UNQUALIFIED_MEETINGS"];
  value.businessPrescription!.interventions = [
    { intervention_code: "INT_BUILD_SALES_STRUCTURE", personalized_action: "Зафиксировать структуру.", why_needed: "Нужна повторяемость." },
    value.businessPrescription!.interventions[0],
  ];
  value.test30d!.actions = [
    { intervention_code: "INT_BUILD_SALES_STRUCTURE", action: "Провести встречу по структуре." },
    value.test30d!.actions[0],
  ];
  assert.throws(() => finalizeAndValidateP03Output(value, prepared), P03InvariantError);
});

test("disallowed cause and disallowed intervention reject", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const badCause = validOutput(prepared);
  badCause.diagnosis.primary_cause_code = "NO_REPEAT_SALES";
  badCause.diagnosis.contributing_cause_codes = [];
  assert.throws(() => finalizeAndValidateP03Output(badCause, prepared), P03InvariantError);
  const badIntervention = validOutput(prepared);
  badIntervention.businessPrescription!.interventions[0].intervention_code = "INT_REQUEST_REFERRALS";
  assert.throws(() => finalizeAndValidateP03Output(badIntervention, prepared), P03InvariantError);
});

test("primary-cause intervention and scenario anchor are mandatory", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  value.businessPrescription!.interventions = [value.businessPrescription!.interventions[1]];
  value.test30d!.actions = [value.test30d!.actions[1]];
  assert.throws(() => finalizeAndValidateP03Output(value, prepared), P03InvariantError);
});

test("a contributing cause can add only its own allowed intervention", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  value.businessPrescription!.interventions[1].intervention_code = "INT_FOLLOW_UP_OPEN_DECISIONS";
  value.test30d!.actions[1].intervention_code = "INT_FOLLOW_UP_OPEN_DECISIONS";
  assert.throws(() => finalizeAndValidateP03Output(value, prepared), P03InvariantError);
});

test("cause without evidence rejects and no cause evidence can return a valid blocked outcome", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const noEvidence = validOutput(prepared);
  noEvidence.diagnosis.evidence_ids = [];
  assert.throws(() => finalizeAndValidateP03Output(noEvidence, prepared), P03InvariantError);
  assert.equal(finalizeAndValidateP03Output(blockedOutput(prepared), prepared).analysisStatus, "blocked_by_insufficient_evidence");
});

test("blocked insufficient evidence requires cause_statement=null", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const blocked = blockedOutput(prepared);
  assert.equal(blocked.diagnosis.cause_statement, null);
  assert.doesNotThrow(() => finalizeAndValidateP03Output(blocked, prepared));
  blocked.diagnosis.cause_statement = "Предварительная недоказанная причина";
  assert.throws(() => finalizeAndValidateP03Output(blocked, prepared), P03InvariantError);
});

test("every selected intervention requires exactly one structured history review", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const valid = validOutput(prepared);
  assert.equal(valid.businessPrescription!.interventions.length, 2);
  assert.equal(valid.interventionHistoryReview.length, 2);
  assert.doesNotThrow(() => finalizeAndValidateP03Output(valid, prepared));

  const missing = validOutput(prepared);
  missing.interventionHistoryReview.pop();
  assert.throws(() => finalizeAndValidateP03Output(missing, prepared), P03InvariantError);

  const duplicate = validOutput(prepared);
  duplicate.interventionHistoryReview[1] = structuredClone(duplicate.interventionHistoryReview[0]);
  assert.throws(() => finalizeAndValidateP03Output(duplicate, prepared), P03InvariantError);

  const extra = validOutput(prepared);
  extra.interventionHistoryReview.push({
    intervention_code: "INT_BUILD_SALES_STRUCTURE",
    match_status: "no_match",
    matched_attempt_evidence_ids: [],
    new_condition_status: "not_applicable",
    new_condition_evidence_ids: [],
    conclusion: "clear_to_test",
  });
  assert.throws(() => finalizeAndValidateP03Output(extra, prepared), P03InvariantError);
});

test("matched history with confirmed current new condition remains valid", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  assert.equal(value.interventionHistoryReview[0].match_status, "matched");
  assert.equal(value.interventionHistoryReview[0].new_condition_status, "confirmed");
  assert.doesNotThrow(() => finalizeAndValidateP03Output(value, prepared));
});

test("no-match history discards model-supplied evidence that cannot represent a matched attempt", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  value.interventionHistoryReview[1].matched_attempt_evidence_ids = ["E01", "E10"];
  value.interventionHistoryReview[1].new_condition_evidence_ids = ["E10"];

  const normalized = finalizeAndValidateP03Output(value, prepared);

  assert.deepEqual(normalized.interventionHistoryReview[1].matched_attempt_evidence_ids, []);
  assert.deepEqual(normalized.interventionHistoryReview[1].new_condition_evidence_ids, []);
});

test("duplicate interventions and dangling evidence are removed without inventing a prescription", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  value.diagnosis.evidence_ids.push("E999");
  value.businessPrescription!.interventions[1] = structuredClone(value.businessPrescription!.interventions[0]);
  value.interventionHistoryReview[1] = structuredClone(value.interventionHistoryReview[0]);
  value.test30d!.actions[1] = structuredClone(value.test30d!.actions[0]);

  const normalized = finalizeAndValidateP03Output(value, prepared);

  assert.deepEqual(normalized.diagnosis.evidence_ids, ["E05", "E07"]);
  assert.equal(normalized.businessPrescription!.interventions.length, 1);
  assert.equal(normalized.interventionHistoryReview.length, 1);
  assert.equal(normalized.test30d!.actions.length, 1);
  assert.equal(normalized.businessPrescription!.interventions[0].intervention_code, "INT_QUALIFY_BEFORE_SALE");
});

test("unclear intervention history requires blocked_by_insufficient_evidence", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const blocked = blockedUnclearHistoryOutput(prepared);
  assert.doesNotThrow(() => finalizeAndValidateP03Output(blocked, prepared));
  blocked.analysisStatus = "blocked_by_inconsistency";
  assert.throws(() => finalizeAndValidateP03Output(blocked, prepared), P03InvariantError);
});

test("gratitude alone does not prove overconsulting", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  value.diagnosis.primary_cause_code = "OVERCONSULTING_FREE_VALUE";
  value.diagnosis.contributing_cause_codes = [];
  value.diagnosis.evidence_ids = ["E01"];
  value.businessPrescription!.interventions = [value.businessPrescription!.interventions[1]];
  value.test30d!.actions = [value.test30d!.actions[1]];
  assert.throws(() => finalizeAndValidateP03Output(value, prepared), P03InvariantError);
});

test("test30d actions cannot use an intervention that was not selected", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  value.test30d!.actions[0].intervention_code = "INT_FOLLOW_UP_OPEN_DECISIONS";
  assert.throws(() => finalizeAndValidateP03Output(value, prepared), P03InvariantError);
});

test("zero-step rejects tactical doubt and accepts direct self-value evidence", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const invalid = validOutput(prepared);
  invalid.businessPrescription!.zero_step = { duration_days: 2, task: "Зафиксировать опору", market_action: "Назвать цену", evidence_ids: ["E01"] };
  assert.throws(() => finalizeAndValidateP03Output(invalid, prepared), P03InvariantError);
  const valid = validOutput(prepared);
  valid.businessPrescription!.zero_step = { duration_days: 2, task: "Зафиксировать доказанную ценность", market_action: "Назвать текущую цену в предложении", evidence_ids: ["E08"] };
  assert.doesNotThrow(() => finalizeAndValidateP03Output(valid, prepared));
});

test("baseline metric cannot be reused as a numeric target", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  value.targetMetric!.target_metric_code = "money_chain.0.payment.value";
  value.targetMetric!.target_value = 1;
  assert.throws(() => finalizeAndValidateP03Output(value, prepared), P03InvariantError);
});

test("numeric target requires an exact role=target backend metric", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const missingTarget = validOutput(prepared);
  missingTarget.targetMetric!.target_metric_code = "money_chain.target.payment.value";
  missingTarget.targetMetric!.target_value = 3;
  assert.throws(() => finalizeAndValidateP03Output(missingTarget, prepared), P03InvariantError);

  prepared.backendMetrics.push({
    metric_code: "money_chain.target.payment.value",
    role: "target",
    value: 3,
    unit: null,
    source: "derived_client_fact",
    evidence_ids: ["E06"],
  });
  const exact = validOutput(prepared);
  exact.targetMetric!.target_metric_code = "money_chain.target.payment.value";
  exact.targetMetric!.target_value = 3;
  assert.doesNotThrow(() => finalizeAndValidateP03Output(exact, prepared));
});

test("backend revenue scenario and locked teaser are immutable", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const revenue = validOutput(prepared);
  revenue.revenueScenario = { description: "Прогноз", formula: "10×1000", result_rub: 10000, assumptions: [], is_forecast: false };
  assert.throws(() => finalizeAndValidateP03Output(revenue, prepared), P03InvariantError);
  const teaser = validOutput(prepared);
  teaser.lockedTeaser = "Другой достаточно длинный тизер, который нельзя возвращать.";
  assert.throws(() => finalizeAndValidateP03Output(teaser, prepared), P03InvariantError);
});

test("supporting elements supplied by AI are replaced by the backend registry union", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  value.supportingElements = [{ element_id: "team", minimal_change: "AI guess", why_needed: "AI guess" }];
  const canonical = canonicalizeP03SupportingElements(validateP03Schema(value));
  assert.deepEqual(canonical.supportingElements.map((item) => item.element_id), ["audience", "sales_technology", "funnel"]);
  assert.doesNotThrow(() => validateP03Invariants(canonical, prepared));
});

test("metric-only task title triggers targeted semantic reevaluation", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const first = validOutput(prepared);
  first.businessPrescription!.client_task_title = "Повысить конверсию продаж";
  const provider = new QueueProvider([first, validOutput(prepared)]);
  const outcome = await runP03MoneyNowPrescription(prepared, { provider });
  assert.equal(outcome.metadata.reevaluationRetryCount, 1);
  assert.match(provider.requests[1].correction ?? "", /metric_only_task_title/u);
});

test("final P-03 validation failure persists only safe issue codes and paths", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const broken = validOutput(prepared);
  broken.businessPrescription!.client_task_title = "Повысить конверсию продаж";
  const provider = new QueueProvider([broken, broken]);

  await assert.rejects(
    () => runP03MoneyNowPrescription(prepared, { provider }),
    (error: unknown) =>
      error instanceof P03RunExecutionError &&
      error.failureCode === "P03_INVARIANT_FAILED" &&
      /metric_only_task_title@\/businessPrescription\/client_task_title/u.test(error.message) &&
      !error.message.includes(broken.diagnosis.money_leak),
  );
});

test("repeated intervention without new condition gets one targeted reevaluation then blocks", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const repeated = validOutput(prepared);
  repeated.interventionHistoryReview[0].new_condition_status = "unknown";
  repeated.interventionHistoryReview[0].new_condition_evidence_ids = [];
  repeated.interventionHistoryReview[0].conclusion = "blocked_repeat_without_new_condition";
  repeated.sanityChecks = [];
  const blocked = blockedRepeatOutput(prepared);
  const provider = new QueueProvider([repeated, blocked]);
  const outcome = await runP03MoneyNowPrescription(prepared, { provider });
  assert.equal(outcome.result.analysisStatus, "blocked_by_inconsistency");
  assert.equal(outcome.metadata.reevaluationRetryCount, 1);
  assert.equal(provider.requests.length, 2);
});

test("low_confidence is a valid analytical outcome and is not retried", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const value = validOutput(prepared);
  value.analysisStatus = "low_confidence";
  value.diagnosis.confidence = "low";
  value.diagnosis.missing_evidence = ["Нужна повторяемая выборка встреч."];
  const provider = new QueueProvider([value]);
  const outcome = await runP03MoneyNowPrescription(prepared, { provider });
  assert.equal(outcome.result.analysisStatus, "low_confidence");
  assert.equal(outcome.metadata.retryCount, 0);
});

test("transport failure gets one technical retry", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const provider = new QueueProvider([new Error("network"), validOutput(prepared)]);
  const outcome = await runP03MoneyNowPrescription(prepared, { provider });
  assert.equal(outcome.metadata.technicalRetryCount, 1);
  assert.equal(provider.requests.length, 2);
});

test("blocked analytical outcome is valid and advances to writing_report", async () => {
  const src = await source();
  const prepared = await prepareP03Input(src) as P03SelectedPreparedInput;
  const repository = new MemoryRepository(src);
  const executed = await runP03Stage("run-1", { repository, provider: new QueueProvider([blockedOutput(prepared)]), createId: () => "p03-1" });
  assert.equal(executed.status, "writing_report");
  assert.equal(executed.outcomeStatus, "blocked_by_insufficient_evidence");
  assert.equal(executed.result.failureCode, null);
  assert.equal(executed.nextStep, "/api/analysis-runs/run-1/p04");
});

test("no_eligible scenario skips AI, persists deterministic outcome and advances", async () => {
  const src = await source(null);
  const repository = new MemoryRepository(src);
  const provider = new QueueProvider([]);
  const executed = await runP03Stage("run-1", { repository, provider, createId: () => "p03-skip" });
  assert.equal(provider.requests.length, 0);
  assert.equal(executed.status, "writing_report");
  assert.equal(executed.outcomeStatus, "skipped_no_eligible_scenario");
  assert.equal(executed.result.skippedOutcome?.reason, "no_eligible_scenario");
  assert.equal(executed.result.providerRawResponse, null);
});

test("same upstream replays idempotently without another AI call", async () => {
  const src = await source();
  const prepared = await prepareP03Input(src) as P03SelectedPreparedInput;
  const repository = new MemoryRepository(src);
  await runP03Stage("run-1", { repository, provider: new QueueProvider([validOutput(prepared)]), createId: () => "p03-1" });
  const provider = new QueueProvider([]);
  const replay = await runP03Stage("run-1", { repository, provider });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(provider.requests.length, 0);
});

test("changed upstream after persistence returns P03_VERSION_CONFLICT", async () => {
  const src = await source();
  const prepared = await prepareP03Input(src) as P03SelectedPreparedInput;
  const repository = new MemoryRepository(src);
  await runP03Stage("run-1", { repository, provider: new QueueProvider([validOutput(prepared)]) });
  src.p01.result!.businessMap.sales = "changed";
  src.moneyNowSelection!.p01ResultHash = await sha256(src.p01.result!);
  await assert.rejects(
    () => runP03Stage("run-1", { repository, provider: new QueueProvider([]) }),
    (error: unknown) => error instanceof P03Error && error.code === "P03_VERSION_CONFLICT",
  );
});

test("persisted v1.4 snapshot is never rewritten by the v1.5 runner", async () => {
  const src = await source();
  const prepared = await prepareP03Input(src) as P03SelectedPreparedInput;
  const repository = new MemoryRepository(src);
  await runP03Stage("run-1", {
    repository,
    provider: new QueueProvider([validOutput(prepared)]),
    createId: () => "p03-existing",
  });
  const oldSnapshot = structuredClone(repository.stored!);
  (oldSnapshot as unknown as { promptVersion: string }).promptVersion = "P-03.v1.4";
  (oldSnapshot as unknown as { outputSchemaVersion: string }).outputSchemaVersion = "1.4";
  oldSnapshot.deterministicInputHash = "persisted-v1.4-input-hash";
  repository.stored = oldSnapshot;
  const before = JSON.stringify(repository.stored);
  await assert.rejects(
    () => runP03Stage("run-1", { repository, provider: new QueueProvider([]) }),
    (error: unknown) => error instanceof P03Error && error.code === "P03_VERSION_CONFLICT",
  );
  assert.equal(JSON.stringify(repository.stored), before);
});

test("repeated intervention guard requires matched attempt evidence and does not depend on sanityChecks", async () => {
  const prepared = await prepareP03Input(await source()) as P03SelectedPreparedInput;
  const repeated = blockedRepeatOutput(prepared);
  assert.equal(repeated.sanityChecks.length, 0);
  assert.doesNotThrow(() => finalizeAndValidateP03Output(repeated, prepared));
  repeated.interventionHistoryReview[0].matched_attempt_evidence_ids = ["E01"];
  assert.throws(() => finalizeAndValidateP03Output(repeated, prepared), P03InvariantError);
});

test("public P-03 endpoint contains no full paid prescription payload", () => {
  const route = readFileSync("app/api/analysis-runs/[analysisRunId]/p03/route.ts", "utf8");
  assert.doesNotMatch(route, /result:\s*executed\.result\.result|diagnosis\s*:|interventions\s*:|test30d\s*:|targetMetric\s*:|revenueScenario\s*:/u);
  assert.doesNotMatch(route, /failureMessage:\s*executed|error\.details|details:\s*error/u);
  assert.match(route, /lockedTeaser/u);
  assert.match(route, /p04Started:\s*false/u);
});

test("public P-03 execution is fail-closed without feature flag and server token", () => {
  const request = (token?: string) => new Request("https://example.test/p03", {
    method: "POST",
    headers: token ? { "x-p03-orchestrator-token": token } : {},
  });
  assert.deepEqual(authorizeP03PublicRequest(request(), {}), {
    allowed: false,
    status: 503,
    code: "P03_PUBLIC_EXECUTION_DISABLED",
    message: "P-03 execution is not available through the public endpoint.",
  });
  assert.equal(authorizeP03PublicRequest(request(), {
    P03_PUBLIC_EXECUTION_ENABLED: "true",
  }).allowed, false);
  assert.equal(authorizeP03PublicRequest(request("wrong"), {
    P03_PUBLIC_EXECUTION_ENABLED: "true",
    P03_ORCHESTRATOR_TOKEN: "secret",
  }).allowed, false);
  assert.deepEqual(authorizeP03PublicRequest(request("secret"), {
    P03_PUBLIC_EXECUTION_ENABLED: "true",
    P03_ORCHESTRATOR_TOKEN: "secret",
  }), { allowed: true });
});

test("P-03 storage is additive, immutable and server-only for provider/result payloads", () => {
  const schema = readFileSync("db/schema.ts", "utf8");
  const migration = readFileSync("drizzle/0007_needy_stark_industries.sql", "utf8");
  assert.match(schema, /p03PrescriptionResults/);
  assert.match(schema, /providerRawResponseJson/);
  assert.match(migration, /p03_prescription_results_run_unique/u);
  assert.match(migration, /money_now_selection_id/u);
  assert.match(migration, /p01_analysis_result_id/u);
});

test("P-03 does not invoke P-04 or alter Stage 7 ranking", () => {
  const runner = readFileSync("server/p03/stage-runner.ts", "utf8");
  const selector = readFileSync("server/7k/money-now-selector.ts", "utf8");
  assert.doesNotMatch(runner, /runP04|final AnalysisResult/u);
  assert.doesNotMatch(runner, /selectMoneyNowCandidate/u);
  assert.match(selector, /proximity_to_money/u);
  assert.equal(MONEY_NOW_SCENARIOS.length, 16);
});
