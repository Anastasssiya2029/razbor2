import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAnalysisResult } from "../validation";
import { ANALYSIS_RESULT_VERSIONS } from "../types";

/**
 * Regression for the P-04 v1.3 client_presentation migration: the final
 * analysis-result.v1 schema pins its own p04Prompt/p04Schema const values
 * separately from the P-04 output schema. When the P-04 schema/prompt/type
 * versions were bumped to v1.3 but this schema's version manifest was left
 * pointing at v1.2, every freshly assembled analysis result failed
 * validateAnalysisResult() and could never be persisted or served. This test
 * exercises the full final-result contract (not just the P-04 output schema)
 * with a client_presentation-bearing route card to catch that class of drift.
 */

function sourceRefs(): string[] {
  return ["TARGET:funnel"];
}

function clientPresentationItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    task_id: "task-1",
    state: "missing",
    client_task: "Персональная формулировка задачи для клиента.",
    client_done_when: "Персональный критерий готовности для клиента.",
    source_refs: sourceRefs(),
    ...overrides,
  };
}

function routeCardReport() {
  return {
    card_id: "card-1",
    order: 1,
    element_id: "funnel",
    role: "priority",
    from_score: 3,
    to_score: 6,
    task_ids: ["task-1", "task-2"],
    card_title: "Настроить воронку продаж",
    why_now: "Потому что сейчас это первый ограничитель роста в системе продаж.",
    what_changes_in_business: "Появится предсказуемый поток заявок вместо случайных обращений.",
    connection_to_next_stage: null,
    source_refs: sourceRefs(),
    client_presentation: {
      items: [clientPresentationItem(), clientPresentationItem({ task_id: "task-2" })],
    },
  };
}

function firstTask() {
  return {
    taskId: "task-1",
    fromScore: 3,
    toScore: 6,
    task: "Настроить один управляемый канал заявок.",
    doneWhen: "Заявки приходят из настроенного канала каждую неделю.",
    transitionVersion: "transitions-70.v2",
  };
}

function secondTask() {
  return {
    taskId: "task-2",
    fromScore: 3,
    toScore: 6,
    task: "Ввести еженедельный подсчёт заявок.",
    doneWhen: "Таблица с числом заявок обновляется каждую неделю.",
    transitionVersion: "transitions-70.v2",
  };
}

function baseP04Report() {
  return {
    promptVersion: "P-04.v1.3",
    schemaVersion: "1.3",
    analysisStatus: "ok",
    opening: {
      headline: "Заголовок отчёта для клиента",
      summary: "Развёрнутое summary длиной больше сорока символов для прохождения схемы.",
      source_refs: sourceRefs(),
    },
    currentConfiguration: {
      summary: "Развёрнутое summary текущей конфигурации длиной больше сорока символов.",
      strengths: ["Сильная сторона"],
      fragilities: ["Слабое место"],
      source_refs: sourceRefs(),
    },
    targetConfiguration: {
      summary: "Развёрнутое summary целевой конфигурации длиной больше сорока символов.",
      key_shifts: [
        {
          element_id: "funnel",
          from_score: 3,
          to_score: 6,
          shift: "Переход от случайных заявок к управляемой воронке продаж.",
          source_refs: ["TARGET:funnel"],
        },
      ],
      source_refs: sourceRefs(),
    },
    archetype: {
      archetype_name: "Тестовый архетип",
      summary: "Развёрнутое summary архетипа длиной больше сорока символов для схемы.",
      source_refs: ["ARCHETYPE:current"],
    },
    growthPoint: {
      priority_element: "funnel",
      build_elements: ["blog"],
      title: "Точка роста для клиента",
      coach_explanation: "Развёрнутое объяснение точки роста длиной больше пятидесяти символов для схемы.",
      what_it_unlocks: ["Появится стабильный поток заявок"],
      source_refs: ["P02:constraint", "P02:bundle"],
    },
    whyNotNow: [
      {
        element_id: "team",
        status: "later",
        text: "Команда пока не является ограничителем роста на этом этапе работы.",
        return_trigger: null,
        source_refs: sourceRefs(),
      },
    ],
    routeCards: [routeCardReport()],
    businessValidation: {
      checkpoint_after_order: 1,
      metric_name: "Число заявок в неделю",
      baseline_value: 5,
      target_value: 15,
      unit: "заявок/нед",
      target_rule: "Рост числа заявок минимум в три раза.",
      formula: null,
      timeframe_days: 30,
      if_signal_absent: "Проверить настройку рекламных каналов и форм захвата.",
      explanation: "Развёрнутое объяснение метрики длиной больше тридцати символов для схемы.",
      source_refs: sourceRefs(),
    },
    moneyNow: {
      status: "no_eligible_scenario",
      scenario_id: null,
      headline: "Быстрых денег сейчас нет",
      narrative: null,
      locked_teaser: "Появится после первого прогресса по приоритетному элементу.",
      source_refs: sourceRefs(),
    },
    finalFocus: {
      headline: "Главный фокус",
      text: "Развёрнутый текст финального фокуса длиной больше тридцати символов для схемы.",
      first_task_id: "task-1",
      first_action: firstTask().task,
      wait_for_signal: "Дождись первого сигнала от аудитории или заявок.",
      source_refs: sourceRefs(),
    },
    sanityChecks: [],
  };
}

function fullScores() {
  return {
    authenticity: 5,
    audience: 5,
    product_method: 5,
    sales_technology: 5,
    funnel: 3,
    blog: 5,
    team: 5,
  };
}

function targetScores() {
  return {
    authenticity: 6,
    audience: 6,
    product_method: 6,
    sales_technology: 6,
    funnel: 6,
    blog: 6,
    team: 6,
  };
}

function buildAnalysisResult() {
  const p04Report = baseP04Report();
  return {
    version: "analysis-result.v1",
    methodologyVersion: "7k.v1.2",
    analysisRunId: "run-1",
    diagnosticId: "diagnostic-1",
    analysisStatus: "ok",
    versions: ANALYSIS_RESULT_VERSIONS,
    clientContext: { expertName: "Тест Тестов", niche: "маркетинг" },
    current: {
      scores: fullScores(),
      current7k: {},
      businessMap: {},
    },
    target: {
      modelFamily: "test",
      modelComponents: [],
      requiredMinimum: fullScores(),
      targetScores: targetScores(),
      gap: fullScores(),
      capabilities: [],
      appliedModifiers: [],
      desiredOwnerRole: "test",
    },
    archetype: {
      totalScore: 35,
      candidateArchetype: "test",
      finalArchetype: "test",
      gates: [],
      downgradeReason: null,
    },
    strategy: {
      constraint: {},
      perceivedVsEvidenced: {},
      previousAttemptsAnalysis: null,
      bundle: { priority_element: "funnel", build_elements: ["blog"] },
      elementSequence: ["funnel"],
      businessValidation: {},
    },
    route: {
      stageVersion: "task-resolver-stage.v1",
      transitionRegistryVersion: "transitions-70.v2",
      cards: [
        {
          cardId: "card-1",
          order: 1,
          elementId: "funnel",
          role: "priority",
          fromScore: 3,
          toScore: 6,
          tasks: [firstTask(), secondTask()],
          p02WhyNow: "why now",
          p02Unlocks: [],
          evidenceIds: [],
        },
      ],
      taskIds: ["task-1", "task-2"],
      totalTasks: 2,
      businessValidation: {},
    },
    moneyNow: {
      status: "no_eligible_scenario",
      selectionStatus: "no_eligible_scenario",
      selectedScenario: null,
      prescription: null,
      skippedOutcome: {},
      narrative: p04Report.moneyNow,
    },
    report: p04Report,
    finalFocus: p04Report.finalFocus,
    provenance: {
      upstreamIds: {},
      upstreamHashes: {},
      p04DeterministicInputHash: "a".repeat(64),
      assemblyInputHash: "b".repeat(64),
    },
  };
}

test("validateAnalysisResult accepts a v1.3 final result carrying client_presentation", () => {
  const result = buildAnalysisResult();
  assert.doesNotThrow(() => validateAnalysisResult(result));
});

test("validateAnalysisResult rejects a final result still pinned to the stale P-04 v1.2 version manifest", () => {
  const result = buildAnalysisResult();
  (result.versions as Record<string, unknown>) = {
    ...ANALYSIS_RESULT_VERSIONS,
    p04Prompt: "P-04.v1.2",
    p04Schema: "1.2",
  };
  assert.throws(() => validateAnalysisResult(result));
});
