import { calculateBusinessArchetype, calculateTargetConfiguration } from "../../server/7k";
import { MONEY_NOW_SELECTOR_CONTRACT } from "../../server/7k/config/money-now-selector-contract.v1";
import { MONEY_NOW_SCENARIO_IDS, type MoneyNowScenarioId } from "../../server/7k/config/money-now.v2.2";
import { SEVEN_K_ELEMENT_IDS, type SevenKScores } from "../../server/7k/types";
import {
  MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256,
  MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256,
  type MoneyNowSelectionSnapshot,
  type StoredMoneyNowSelection,
} from "../../server/money-now-selector/types";
import type { P01ResultV1_4_2 } from "../../server/p01/types";
import type { StoredP02Result } from "../../server/p02/stage-types";
import type { P01StrategyContext, P02ResultV1_3, TargetConfigProjection } from "../../server/p02/types";
import type { StoredP03Result } from "../../server/p03/stage-types";
import { P03_LOCKED_TEASER, type P03ResultV1_5 } from "../../server/p03/types";
import type { P04PreparedInput, P04Source } from "../../server/p04/stage-types";
import type { P04ResultV1_2 } from "../../server/p04/types";
import { getExpectedArchetypeName } from "../../server/p04/projections";
import { sha256 } from "../../server/stage4/hash";
import type { StoredTargetArchetypeResult } from "../../server/stage4/types";
import { buildResolvedTransitionPlan } from "../../server/task-resolver/resolve-plan";
import type { StoredResolvedTransitionPlan } from "../../server/task-resolver/types";
import { unknownMoneyNowFacts } from "./p01-v1.4";

export type P04FixtureMoneyStatus =
  | "available"
  | "no_eligible_scenario"
  | "blocked_insufficient_evidence"
  | "blocked_inconsistency";

export const P04_FIXTURE_CURRENT: SevenKScores = {
  authenticity: 2,
  audience: 2,
  product_method: 2,
  sales_technology: 2,
  funnel: 2,
  blog: 2,
  team: 2,
};

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

export function p04FixtureP01(selectedScenario: MoneyNowScenarioId | null = "MN14"): P01ResultV1_4_2 {
  const ledger = [
    evidence("E01", "Текущая бизнес-система описана по каждому элементу 7К."),
    evidence("E02", "За текущий месяц было 10 целевых встреч и одно предложение дошло до оплаты.", { evidence_type: "metric_result" }),
    evidence("E05", "Часть встреч проходит с людьми без подходящей задачи и готовности покупать."),
    evidence("E06", "Из 10 встреч произошла 1 оплата, конверсия составляет 10 процентов.", { evidence_type: "metric_result" }),
    evidence("E07", "На бесплатном разборе клиент уже получает существенную часть решения и готовый план."),
    evidence("E09", "Ранее тестировали квалификацию, результата не удержали.", { source_field: "experience.failures", time_scope: "historical_only" }),
    evidence("E10", "Сейчас перед встречей появилась обязательная анкета с тремя критериями и ответственным за проверку."),
  ];
  const current7k = Object.fromEntries(SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, {
    score: P04_FIXTURE_CURRENT[elementId],
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
      activatedCapabilities: [{
        code: "priority_segment",
        reason: "Маршрут фикстуры проверяет переход аудитории к подтверждённому приоритетному сегменту.",
        source_fields: ["target.businessModel"],
      }],
      desiredRoleSummary: null,
      desiredSystemWeeklyHours: null,
      confidence: "medium",
      missing_evidence: [],
    },
    sanityChecks: [],
  };
}

function targetProjection(target: ReturnType<typeof calculateTargetConfiguration>): TargetConfigProjection {
  return {
    modelFamily: target.modelFamily,
    modelComponents: target.modelComponents,
    visionModelFamily: target.visionModelFamily,
    visionModelComponents: target.visionModelComponents,
    modelTransitionNote: target.modelTransitionNote,
    requiredMinimum: target.requiredMinimum,
    targetScores: target.targetScores,
    gap: target.gap,
    capabilities: target.capabilities,
    appliedModifiers: target.appliedModifiers,
    desiredOwnerRole: target.desiredOwnerRole,
  };
}

const BUSINESS_VALIDATION: P02ResultV1_3["businessValidation"] = {
  checkpoint_after_order: 1,
  metric_name: "Факт целевого разговора",
  baseline_value: null,
  target_value: null,
  unit: "разговоров",
  target_rule: "Зафиксировать фактический сигнал после нового перехода.",
  formula: null,
  assumptions: [],
  timeframe_days: 14,
  if_signal_absent: "Переоценить ограничение и не продолжать маршрут автоматически.",
  evidence_ids: ["E01"],
};

function p02Result(): P02ResultV1_3 {
  return {
    promptVersion: "P-02.v1.3",
    schemaVersion: "1.3",
    analysisStatus: "ok",
    constraint: {
      symptom: "Рост продаж нестабилен",
      functional_bottleneck: "Не подтверждён переход от разговора к оплате",
      constraint_stage: "next_step",
      constraint_type: "path_break",
      root_cause: "До встречи не подтверждается готовность подходящего клиента",
      root_evidence_ids: ["E05"],
      counterevidence_ids: [],
      confidence: "medium",
      missing_evidence: [],
    },
    perceivedVsEvidenced: {
      client_hypothesis: "Не получается стабильно продавать.",
      evidenced_bottleneck: "Переход к оплате не подтверждён",
      relation: "insufficient_data",
      explanation: "Доступные факты показывают разрыв до оплаты.",
      evidence_ids: ["E05", "E06"],
    },
    previousAttemptsAnalysis: {
      attempts_summary: ["Ранее вводилась квалификация перед встречей."],
      repeated_break_pattern: null,
      why_not_stable: "Новый порядок не стал повторяемым процессом.",
      route_difference: "Маршрут учитывает проверку реального сигнала после первого этапа.",
      confidence: "medium",
      evidence_ids: ["E09", "E10"],
    },
    candidateAudit: [{
      element_id: "product_method",
      hypothesis: "Разовая консультация не задаёт клиенту понятного платного продолжения.",
      supporting_evidence_ids: ["E01", "E06"],
      counterevidence_ids: [],
      dependency_position: "До повторяемой продажи",
      target_necessity: "Для целевой модели нужен собранный пакет и понятный следующий шаг.",
      decision: "selected",
      rejection_reason: null,
      tie_break_step: null,
    }],
    bundle: {
      priority_element: "product_method",
      build_elements: ["sales_technology"],
      maintain_elements: ["authenticity", "audience", "funnel", "blog", "team"],
      later_elements: [],
      why_this_bundle: "Сначала собираются продуктовый следующий шаг и способ его продажи.",
      why_not_now: [],
    },
    elementSequence: [
      {
        order: 1,
        element_id: "product_method",
        role: "priority",
        from_score: 2,
        to_score: 3,
        why_now: "Понятный пакет нужен до повторяемой продажи.",
        prerequisite_elements: [],
        unlocks: ["Платный следующий шаг после первой консультации"],
        evidence_ids: ["E01", "E06"],
      },
      {
        order: 2,
        element_id: "sales_technology",
        role: "build",
        from_score: 2,
        to_score: 4,
        why_now: "Новый пакет нужно предлагать по одной понятной структуре встречи.",
        prerequisite_elements: ["product_method"],
        unlocks: ["Повторяемый переход от встречи к оплате"],
        evidence_ids: ["E05", "E06"],
      },
    ],
    businessValidation: BUSINESS_VALIDATION,
    sanityChecks: [],
  };
}

function p03Result(status: Exclude<P04FixtureMoneyStatus, "no_eligible_scenario">): P03ResultV1_5 {
  const blocked = status === "blocked_insufficient_evidence" || status === "blocked_inconsistency";
  return {
    promptVersion: "P-03.v1.5",
    schemaVersion: "1.5",
    analysisStatus:
      status === "available"
        ? "ok"
        : status === "blocked_insufficient_evidence"
          ? "blocked_by_insufficient_evidence"
          : "blocked_by_inconsistency",
    selectedScenario: { scenario_id: "MN14", scenario_title: "Квалифицировать встречи до продажи" },
    diagnosis: {
      observed_fact: "Часть встреч нецелевая, а бесплатный разбор содержит готовый план.",
      money_leak: "Встречи расходуют ресурс, но редко доходят до оплаты.",
      primary_cause_code: blocked ? null : "UNQUALIFIED_MEETINGS",
      cause_statement: blocked ? null : "До встречи не отделены люди, которым продукт подходит сейчас.",
      contributing_cause_codes: blocked ? [] : ["OVERCONSULTING_FREE_VALUE"],
      evidence_ids: blocked ? [] : ["E05", "E07"],
      counterevidence_ids: [],
      confidence: blocked ? "low" : "medium",
      missing_evidence: blocked ? ["Нужны записи нескольких встреч."] : [],
    },
    businessPrescription: blocked ? null : {
      client_task_title: "Ввести квалификацию до продающей встречи",
      coach_explanation: "До встречи фиксируются критерии подходящего клиента и границы бесплатной части.",
      precondition: null,
      interventions: [{
        intervention_code: "INT_QUALIFY_BEFORE_SALE",
        personalized_action: "Зафиксировать три критерия целевого клиента до встречи.",
        why_needed: "Так встреча начинается только с подходящим запросом.",
      }],
      expected_change: "Встречи становятся целевыми, а платный следующий шаг различимым.",
      do_not_scale_yet: ["Не увеличивать поток до проверки нового перехода."],
      zero_step: null,
    },
    interventionHistoryReview: blocked ? [] : [{
      intervention_code: "INT_QUALIFY_BEFORE_SALE",
      match_status: "matched",
      matched_attempt_evidence_ids: ["E09"],
      new_condition_status: "confirmed",
      new_condition_evidence_ids: ["E10"],
      conclusion: "clear_to_test",
    }],
    targetMetric: null,
    test30d: blocked ? null : {
      audience: "Эксперты с подтверждённой задачей продаж.",
      offer: "Пакет консультаций.",
      asset: "Тёплая сеть.",
      path: "Квалификация, диагностическая встреча, предложение, решение.",
      actions: [{ intervention_code: "INT_QUALIFY_BEFORE_SALE", action: "Проверять три критерия перед встречей." }],
      repetitions: null,
      primary_metric: "Оплаты после продающих встреч",
      baseline: 1,
      target_signal: "Появляется наблюдаемое изменение оплат при той же структуре учёта.",
      review_day: 30,
      decision_rule: "При отсутствии сигнала причина проверяется повторно.",
    },
    revenueScenario: null,
    supportingElements: [],
    lockedTeaser: P03_LOCKED_TEASER,
    sanityChecks: [],
  };
}

export async function makeP04Source(
  moneyStatus: P04FixtureMoneyStatus = "available",
): Promise<P04Source> {
  const selected = moneyStatus !== "no_eligible_scenario";
  const p01 = p04FixtureP01(selected ? "MN14" : null);
  const target = calculateTargetConfiguration({
    currentScores: P04_FIXTURE_CURRENT,
    modelFamily: "package_1to1",
    activatedCapabilities: ["priority_segment"],
    desiredSystemWeeklyHours: null,
  });
  const archetype = calculateBusinessArchetype(P04_FIXTURE_CURRENT);
  const p02 = p02Result();
  const resolvedPlan = buildResolvedTransitionPlan({
    elementSequence: p02.elementSequence,
    businessValidation: p02.businessValidation,
    currentScores: P04_FIXTURE_CURRENT,
    targetScores: target.targetScores,
  });
  const p01ResultHash = await sha256(p01);
  const targetResultHash = await sha256(target);
  const p02ResultHash = await sha256(p02);
  const resolvedTransitionPlanHash = await sha256(resolvedPlan);

  const targetStage: StoredTargetArchetypeResult = {
    id: "target-1",
    diagnosticId: "diag-1",
    analysisRunId: "run-1",
    p01AnalysisResultId: "p01-1",
    p01InputHash: "p01-input",
    p01ResultHash,
    currentScores: P04_FIXTURE_CURRENT,
    targetInput: null,
    target,
    archetype,
    resourceVersions: {
      stageVersion: "target-archetype-stage.v1",
      p01PromptVersion: "P-01.v1.4.2",
      p01OutputSchemaVersion: "1.4",
      elements: "elements.v1",
      targetRules: "target-rules.v2.2",
      archetypes: "archetypes.v2",
    },
    deterministicInputHash: "target-input",
    startedAt: "2026-08-19T10:00:00.000Z",
    completedAt: "2026-08-19T10:00:01.000Z",
    failureCode: null,
    failureMessage: null,
  };
  const strategyContext: P01StrategyContext = {
    evidenceLedger: p01.evidenceLedger,
    current7k: p01.current7k,
    businessMap: p01.businessMap,
    moneyChainFacts: p01.moneyChainFacts,
    desiredRoleSummary: p01.targetIntent.desiredRoleSummary,
    desiredSystemWeeklyHours: p01.targetIntent.desiredSystemWeeklyHours,
  };
  const targetConfig = targetProjection(target);
  const storedP02: StoredP02Result = {
    id: "p02-1",
    diagnosticId: "diag-1",
    analysisRunId: "run-1",
    p01AnalysisResultId: "p01-1",
    targetArchetypeResultId: "target-1",
    p01ResultHash,
    targetResultHash,
    promptVersion: "P-02.v1.3",
    outputSchemaVersion: "1.3",
    ruleVersions: {
      requestBuilder: "p02-request-builder.v2.1",
      elements: "elements.v1",
      levelCapabilities: "scoring-rules.v3.2",
      constraintRules: "constraint-rules.v2.1",
      dependencyRules: "dependency-rules.v2.1",
      targetRules: "target-rules.v2.2",
      transitionLevers: "transition-levers.v2",
    },
    inputHash: "p02-input",
    strategyContext,
    targetConfig,
    result: p02,
    providerRawResponse: null,
    provider: "fixture",
    model: "fixture",
    startedAt: "2026-08-19T10:00:01.000Z",
    finishedAt: "2026-08-19T10:00:02.000Z",
    latencyMs: 1,
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
    costUsd: 0,
    retryCount: 0,
    technicalRetryCount: 0,
    reevaluationRetryCount: 0,
    failureCode: null,
    failureMessage: null,
  };
  const storedPlan: StoredResolvedTransitionPlan = {
    id: "plan-1",
    diagnosticId: "diag-1",
    analysisRunId: "run-1",
    p01AnalysisResultId: "p01-1",
    targetArchetypeResultId: "target-1",
    p02AnalysisResultId: "p02-1",
    p02ResultHash,
    targetResultHash,
    stageVersion: "task-resolver-stage.v1",
    transitionRegistryVersion: "transitions-70.v2",
    deterministicInputHash: "resolver-input",
    plan: resolvedPlan,
    startedAt: "2026-08-19T10:00:02.000Z",
    completedAt: "2026-08-19T10:00:03.000Z",
    failureCode: null,
    failureMessage: null,
  };
  const selectedScenario = selected ? {
    scenarioId: "MN14" as const,
    moneyDistance: "one_step" as const,
    proximityRank: 2,
    proofLevel: 2 as const,
    capacityFit: "fit" as const,
    modelFit: "fit" as const,
    signalSpeedRank: 2 as const,
    complexity: "low" as const,
    evidenceIds: ["E02", "E05"],
  } : null;
  const snapshot: MoneyNowSelectionSnapshot = {
    stageVersion: "money-now-selector-stage.v1",
    selectorContractVersion: "money-now-selector-contract.v1.2",
    selectorContractJsonSha256: MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256,
    selectorContractTsSha256: MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256,
    businessMethodologyVersion: "money-now.v2.2",
    factExtractionVersion: "money-now-fact-extraction.v1",
    p01PromptVersion: "P-01.v1.4.2",
    selectionStatus: selected ? "selected" : "no_eligible_scenario",
    selectedScenario,
    candidateTrace: [],
    rankingTrace: { orderedScenarioIds: selected ? ["MN14"] : [], comparisons: [] },
    selectorInputHash: "selector-input",
  };
  const moneyNowSelectionHash = await sha256(snapshot);
  const storedSelection: StoredMoneyNowSelection = {
    id: "money-1",
    diagnosticId: "diag-1",
    analysisRunId: "run-1",
    p01AnalysisResultId: "p01-1",
    p01ResultHash,
    taskResolverPlanId: "plan-1",
    taskResolverPlanHash: resolvedTransitionPlanHash,
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
    startedAt: "2026-08-19T10:00:03.000Z",
    completedAt: "2026-08-19T10:00:04.000Z",
    failure: null,
  };
  const result = selected ? p03Result(moneyStatus as Exclude<P04FixtureMoneyStatus, "no_eligible_scenario">) : null;
  const skippedOutcome = selected ? null : {
    status: "skipped_no_eligible_scenario" as const,
    p03Result: null,
    moneyNowSelectionId: "money-1",
    reason: "no_eligible_scenario" as const,
  };
  const storedP03: StoredP03Result = {
    id: "p03-1",
    diagnosticId: "diag-1",
    analysisRunId: "run-1",
    moneyNowSelectionId: "money-1",
    moneyNowSelectionHash,
    p01AnalysisResultId: "p01-1",
    p01ResultHash,
    stageVersion: "p03-money-now-prescription-stage.v1",
    promptVersion: "P-03.v1.5",
    outputSchemaVersion: "1.5",
    ruleVersions: {
      selectorContract: "money-now-selector-contract.v1.2",
      selectorMethodology: "money-now.v2.2",
      prescriptionMethodology: "money-now.v2.3",
      prescriptionRules: "money-now-prescription-rules.v1",
      factExtraction: "money-now-fact-extraction.v1",
      promptSha256: "fixture",
    },
    contextHash: null,
    inputHash: "p03-input",
    deterministicInputHash: "p03-deterministic",
    context: null,
    selectedScenario: selected ? {
      scenario_id: "MN14",
      scenario_title: "Квалифицировать встречи до продажи",
      money_distance: "one_step",
      proximity_rank: 2,
      proof_level: 2,
      capacity_fit: "fit",
      model_fit: "fit",
      signal_speed_rank: 2,
      complexity: "low",
      evidence_ids: ["E02", "E05"],
    } : null,
    backendMetrics: [],
    backendRevenueScenario: null,
    lockedTeaserVersion: "money-now-locked-teaser.v1",
    lockedTeaser: P03_LOCKED_TEASER,
    result,
    skippedOutcome,
    providerRawResponse: null,
    provider: selected ? "fixture" : null,
    model: selected ? "fixture" : null,
    startedAt: "2026-08-19T10:00:04.000Z",
    finishedAt: "2026-08-19T10:00:05.000Z",
    latencyMs: 1,
    inputTokens: selected ? 1 : null,
    outputTokens: selected ? 1 : null,
    totalTokens: selected ? 2 : null,
    costUsd: selected ? 0 : null,
    retryCount: 0,
    technicalRetryCount: 0,
    reevaluationRetryCount: 0,
    failureCode: null,
    failureMessage: null,
  };
  return {
    analysisRunId: "run-1",
    diagnosticId: "diag-1",
    runStatus: "writing_report",
    clientContext: { expertName: "Екатерина", niche: "Консалтинг" },
    p01: {
      id: "p01-1",
      promptVersion: "P-01.v1.4.2",
      outputSchemaVersion: "1.4",
      result: p01,
      failureCode: null,
    },
    targetStage,
    p02: storedP02,
    resolvedPlan: storedPlan,
    moneyNowSelection: storedSelection,
    p03: storedP03,
  };
}

export function makeValidP04Output(input: P04PreparedInput): P04ResultV1_2 {
  const firstCard = input.context.resolvedPlan.cards[0];
  const moneyNarrative = input.reportPolicy.moneyNowStatus === "no_eligible_scenario"
    ? "Подтверждённый ближайший денежный сценарий не найден; вывод остаётся без замены и без запасной рекомендации."
    : input.reportPolicy.moneyNowStatus === "blocked_insufficient_evidence"
      ? "Для точного денежного вывода пока недостаточно подтверждённых фактов о текущих продажах."
      : input.reportPolicy.moneyNowStatus === "blocked_inconsistency"
        ? "Данные о предыдущей попытке и новом условии противоречат друг другу, поэтому вывод заблокирован."
        : "Ближайший денежный сценарий подтверждён текущими фактами и сохранён отдельно как клиентский материал.";
  return {
    promptVersion: "P-04.v1.2",
    schemaVersion: "1.2",
    analysisStatus: input.reportPolicy.analysisStatus,
    opening: {
      headline: "Карта перехода собрана",
      summary: "Текущая конфигурация, целевой ориентир и последовательность перехода собраны только из подтверждённых результатов предыдущих этапов.",
      source_refs: ["P01:businessMap", "P02:bundle", "TARGET:model"],
    },
    currentConfiguration: {
      summary: "Система уже содержит работающие контакты и понятный формат помощи, но переход от разговора к оплате пока не закреплён как повторяемый процесс.",
      strengths: ["Есть тёплая сеть и фактический опыт продаж через личные приглашения."],
      fragilities: ["Качество разговора до предложения пока подтверждается непоследовательно."],
      source_refs: ["P01:businessMap", "P01:E02", "P01:E05"],
    },
    targetConfiguration: {
      summary: "Целевая конфигурация усиливает необходимые элементы пакетной индивидуальной модели без снижения уже достигнутых уровней.",
      key_shifts: input.reportPolicy.targetShiftElements.map((item) => ({
        ...item,
        shift: `Элемент ${item.element_id} переходит от текущего уровня ${item.from_score} к необходимому уровню ${item.to_score}.`,
        source_refs: [`TARGET:${item.element_id}`, `P01:current7k:${item.element_id}`],
      })),
      source_refs: ["TARGET:model"],
    },
    archetype: {
      archetype_name: getExpectedArchetypeName(input.context),
      summary: "Текущий архетип отражает способ, которым бизнес строится сейчас, и не используется для пересмотра причины или порядка маршрута.",
      source_refs: ["ARCHETYPE:current"],
    },
    growthPoint: {
      priority_element: input.context.strategy.bundle.priority_element,
      build_elements: input.context.strategy.bundle.build_elements,
      title: "Главная точка роста",
      coach_explanation: "Главный переход связан с качеством аудитории до продажи: этот элемент стоит раньше предложения и определяет, появляется ли проверяемый бизнес-сигнал.",
      what_it_unlocks: ["Проверяемый переход от целевого разговора к решению клиента."],
      source_refs: ["P02:constraint", "P02:bundle", "P02:sequence:1"],
    },
    whyNotNow: input.reportPolicy.whyNotNowExpected.map((item) => ({
      ...item,
      text: `Элемент ${item.element_id} сохраняется на текущем уровне до появления подтверждённого сигнала первого перехода.`,
      source_refs: ["P02:bundle"],
    })),
    routeCards: input.reportPolicy.routeCardIdentities.map((identity) => ({
      ...identity,
      task_ids: [...identity.task_ids],
      card_title: "Подтвердить качество целевого разговора",
      why_now: "Этот этап расположен первым, потому что он проверяет разрыв перед предложением и не требует перестраивать остальные элементы заранее.",
      what_changes_in_business: "Появляется наблюдаемое различие между целевыми и нецелевыми разговорами.",
      connection_to_next_stage: null,
      source_refs: [
        `PLAN:card:${identity.card_id}`,
        `P02:sequence:${identity.order}`,
        ...identity.task_ids.map((taskId) => `TASK:${taskId}`),
      ],
    })),
    businessValidation: {
      checkpoint_after_order: input.context.strategy.businessValidation.checkpoint_after_order,
      metric_name: input.context.strategy.businessValidation.metric_name,
      baseline_value: input.context.strategy.businessValidation.baseline_value,
      target_value: input.context.strategy.businessValidation.target_value,
      unit: input.context.strategy.businessValidation.unit,
      target_rule: input.context.strategy.businessValidation.target_rule,
      formula: input.context.strategy.businessValidation.formula,
      timeframe_days: input.context.strategy.businessValidation.timeframe_days,
      if_signal_absent: input.context.strategy.businessValidation.if_signal_absent,
      explanation: "После первого этапа проверяется реальный бизнес-сигнал; без него маршрут не продолжается автоматически.",
      source_refs: ["P02:validation"],
    },
    moneyNow: {
      status: input.reportPolicy.moneyNowStatus,
      scenario_id: input.context.moneyNow.selectedScenario?.scenario_id ?? null,
      headline: "Где деньги сейчас",
      narrative: moneyNarrative,
      locked_teaser: input.context.moneyNow.lockedTeaser,
      source_refs: ["MN:selection", "P03:outcome", "P03:locked_teaser"],
    },
    finalFocus: {
      headline: "Первый фиксированный шаг",
      text: "Маршрут начинается с первой задачи из неизменяемой матрицы переходов, затем проверяется указанный бизнес-сигнал.",
      first_task_id: input.reportPolicy.firstTask.taskId,
      first_action: input.reportPolicy.firstTask.task,
      wait_for_signal: input.reportPolicy.validationSignal,
      source_refs: [`TASK:${input.reportPolicy.firstTask.taskId}`, `PLAN:card:${firstCard.cardId}`, "P02:validation"],
    },
    sanityChecks: [],
  };
}
