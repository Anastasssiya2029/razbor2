import assert from "node:assert/strict";
import { test } from "node:test";
import { validateP04Schema, P04SchemaValidationError } from "../validation";

/**
 * Regression coverage for the client_presentation layer added to each route
 * card in schema v1.3. These tests exercise validateP04Schema directly
 * (structural JSON Schema checks) rather than the full P-04 pipeline, since
 * building a complete P04PreparedInput fixture is out of scope here; the
 * business-logic checks (task_id grounding, non-verbatim personalization)
 * live in validateP04Invariants / validateClientPresentation and are
 * exercised end-to-end whenever a real report is generated.
 */

function sourceRefs(): string[] {
  return ["TARGET:funnel"];
}

function baseClientPresentationItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    task_id: "task-1",
    state: "missing",
    client_task: "Персональная формулировка задачи для клиента.",
    client_done_when: "Персональный критерий готовности для клиента.",
    source_refs: sourceRefs(),
    ...overrides,
  };
}

function baseRouteCard(clientPresentationItems: unknown[]) {
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
    client_presentation: { items: clientPresentationItems },
  };
}

function baseResult(routeCards: unknown[]) {
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
    routeCards,
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
      first_action: "Сделай первое конкретное действие по приоритетной задаче.",
      wait_for_signal: "Дождись первого сигнала от аудитории или заявок.",
      source_refs: sourceRefs(),
    },
    sanityChecks: [],
  };
}

test("validateP04Schema accepts a route card with 2-7 client_presentation items", () => {
  const result = baseResult([
    baseRouteCard([baseClientPresentationItem(), baseClientPresentationItem({ task_id: "task-2" })]),
  ]);
  assert.doesNotThrow(() => validateP04Schema(result));
});

test("validateP04Schema rejects a route card with only 1 client_presentation item", () => {
  const result = baseResult([baseRouteCard([baseClientPresentationItem()])]);
  assert.throws(() => validateP04Schema(result), P04SchemaValidationError);
});

test("validateP04Schema rejects a route card with 8 client_presentation items", () => {
  const items = Array.from({ length: 8 }, (_, index) => baseClientPresentationItem({ task_id: `task-${index + 1}` }));
  const result = baseResult([baseRouteCard(items)]);
  assert.throws(() => validateP04Schema(result), P04SchemaValidationError);
});

test("validateP04Schema rejects a route card missing client_presentation entirely", () => {
  const card = baseRouteCard([baseClientPresentationItem(), baseClientPresentationItem({ task_id: "task-2" })]) as Record<string, unknown>;
  delete card.client_presentation;
  const result = baseResult([card]);
  assert.throws(() => validateP04Schema(result), P04SchemaValidationError);
});

test("validateP04Schema rejects an unknown state value in a client_presentation item", () => {
  const result = baseResult([
    baseRouteCard([
      baseClientPresentationItem({ state: "not_a_real_state" }),
      baseClientPresentationItem({ task_id: "task-2" }),
    ]),
  ]);
  assert.throws(() => validateP04Schema(result), P04SchemaValidationError);
});

test("validateP04Schema rejects the stale v1.2 promptVersion/schemaVersion literals", () => {
  const result = {
    ...baseResult([baseRouteCard([baseClientPresentationItem(), baseClientPresentationItem({ task_id: "task-2" })])]),
    promptVersion: "P-04.v1.2",
    schemaVersion: "1.2",
  };
  assert.throws(() => validateP04Schema(result), P04SchemaValidationError);
});
