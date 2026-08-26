import assert from "node:assert/strict";
import test from "node:test";
import {
  MANAGER_PLAN_VERSION,
  applyManagerPlan,
  buildCanonicalChecklist,
  managerPlanContentFromCards,
  splitCanonicalTransitionTask,
  type ManagerPlanVersion,
} from "../lib/analysis-checklist";
import type { AnalysisResultV1 } from "../server/analysis-result";
import { ManagerPlanError, validateManagerPlanContent } from "../server/manager-plan";
import { TRANSITIONS_70 } from "../server/7k/transition-resolver";

function resultFixture(): AnalysisResultV1 {
  return {
    current: {
      scores: { authenticity: 2, audience: 2, product_method: 1, sales_technology: 2, funnel: 3, blog: 1, team: 1 },
    },
    target: {
      targetScores: { authenticity: 3, audience: 3, product_method: 2, sales_technology: 3, funnel: 3, blog: 1, team: 1 },
    },
    strategy: { bundle: { priority_element: "product_method", build_elements: ["audience"] } },
    route: {
      cards: [
        { elementId: "product_method", cardId: "card-product" },
        { elementId: "sales_technology", cardId: "card-sales" },
        { elementId: "audience", cardId: "card-audience" },
        { elementId: "authenticity", cardId: "card-authenticity" },
      ],
    },
    report: {
      routeCards: [
        { card_id: "card-product", why_now: "Сначала нужен пакет." },
        { card_id: "card-sales", why_now: "Потом — структура продажи." },
        { card_id: "card-audience", why_now: "Поддерживает упаковку." },
        { card_id: "card-authenticity", why_now: "Уточняет позиционирование." },
      ],
    },
    provenance: { assemblyInputHash: "result-hash" },
  } as unknown as AnalysisResultV1;
}

test("manager version edits canonical copy and adds a task without changing the source checklist", () => {
  const result = resultFixture();
  const canonical = buildCanonicalChecklist(result);
  assert.equal(canonical[0].tasks[0].id, "bundle:BR-01");
  assert.match(canonical[0].tasks[0].task, /Собрать продукт с понятным результатом/u);
  assert.ok(canonical[0].tasks.some((task) => task.id === "product_method_1_2"));
  const content = managerPlanContentFromCards(canonical);
  content.cards[0].tasks[0].task = "Собрать понятный пакет для клиента";
  content.cards[0].tasks.push({
    id: "manager-12345678-abcd",
    source: "manager",
    task: "Добавить предложение в презентацию",
    doneWhen: "Менеджер видит финальный оффер",
  });
  const validated = validateManagerPlanContent(content, result);
  assert.equal(validated.cards[0].tasks.at(-1)?.source, "manager");
  assert.notEqual(validated.cards[0].tasks[0].task, canonical[0].tasks[0].task);
  assert.equal(buildCanonicalChecklist(result)[0].tasks[0].task, canonical[0].tasks[0].task);
});

test("manager version cannot delete or relabel canonical tasks", () => {
  const result = resultFixture();
  const content = managerPlanContentFromCards(buildCanonicalChecklist(result));
  content.cards[0].tasks.shift();
  assert.throws(
    () => validateManagerPlanContent(content, result),
    (error) => error instanceof ManagerPlanError && error.code === "MANAGER_PLAN_INVALID",
  );
});

test("saved copy is applied only to the exact immutable analysis result", () => {
  const canonical = buildCanonicalChecklist(resultFixture());
  const content = managerPlanContentFromCards(canonical);
  content.cards[0].tasks[0].task = "Версия менеджера";
  const version: ManagerPlanVersion = {
    ...content,
    version: MANAGER_PLAN_VERSION,
    sourceResultHash: "result-hash",
    revision: 2,
    updatedAt: "2026-08-24 12:00:00",
  };
  assert.equal(applyManagerPlan(canonical, version, "result-hash")[0].tasks[0].task, "Версия менеджера");
  assert.notEqual(applyManagerPlan(canonical, version, "different-hash")[0].tasks[0].task, "Версия менеджера");
});

test("an older saved manager copy does not hide a newly approved canonical bundle task", () => {
  const canonical = buildCanonicalChecklist(resultFixture());
  const content = managerPlanContentFromCards(canonical);
  content.cards[0].tasks = content.cards[0].tasks.filter((task) => task.id !== "bundle:BR-01");
  const version: ManagerPlanVersion = {
    ...content,
    sourceResultHash: "result-hash",
    revision: 1,
    updatedAt: "2026-08-25 12:00:00",
  };
  const applied = applyManagerPlan(canonical, version, "result-hash");
  assert.equal(applied[0].tasks[0].id, "bundle:BR-01");
});

test("a bulleted transition is rendered as separate checklist checkpoints without bullet characters", () => {
  const transition = TRANSITIONS_70.find((item) => item.task_id === "funnel_2_3");
  assert.ok(transition);
  const bulleted = {
    ...transition,
    task: "• Выбрать несколько источников клиентов.\n• Простроить путь клиента до предложения.",
  };
  const tasks = splitCanonicalTransitionTask(bulleted);
  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks.map((task) => task.id), ["funnel_2_3", "funnel_2_3:2"]);
  assert.ok(tasks.every((task) => !/[•●]/u.test(task.task)));
  assert.match(tasks[0].task, /источников клиентов/u);
  assert.match(tasks[1].task, /путь клиента/u);
});

test("an older saved manager copy with combined bullets is normalized during merge", () => {
  const transition = TRANSITIONS_70.find((item) => item.task_id === "funnel_2_3");
  assert.ok(transition);
  const bulleted = {
    ...transition,
    task: "• Выбрать несколько источников клиентов.\n• Простроить путь клиента до предложения.",
  };
  const canonical = [{
    elementId: "funnel" as const,
    fromScore: 2,
    toScore: 3,
    order: 1,
    narrative: null,
    tasks: splitCanonicalTransitionTask(bulleted),
  }];
  const version: ManagerPlanVersion = {
    version: MANAGER_PLAN_VERSION,
    sourceResultHash: "legacy-result",
    revision: 1,
    updatedAt: "2026-08-25 12:00:00",
    cards: [{
      elementId: "funnel",
      tasks: [{
        id: transition.task_id,
        source: "canonical",
        task: bulleted.task,
        doneWhen: transition.done_when,
      }],
    }],
  };
  const applied = applyManagerPlan(canonical, version, "legacy-result");
  assert.deepEqual(applied[0].tasks.map((task) => task.id), ["funnel_2_3", "funnel_2_3:2"]);
  assert.ok(applied[0].tasks.every((task) => !/[•●]/u.test(task.task)));
});
