import assert from "node:assert/strict";
import test from "node:test";
import { validateDiagnosticInput } from "../lib/diagnostic-input";
import { calculateBusinessArchetype } from "../server/7k/business-archetype";
import { resolveTransitionSequence } from "../server/7k/transition-resolver";
import { calculateTargetConfiguration } from "../server/7k/target-configuration";
import { SEVEN_K_ELEMENT_IDS } from "../server/7k/types";
import {
  ALINA_GOLDEN_CASE,
  ANNA_GOLDEN_CASE,
  SEVEN_K_GOLDEN_CASES,
} from "./fixtures/anna-alina-golden";

function total(scores: Record<(typeof SEVEN_K_ELEMENT_IDS)[number], number>): number {
  return SEVEN_K_ELEMENT_IDS.reduce((sum, elementId) => sum + scores[elementId], 0);
}

test("Anna and Alina golden inputs satisfy DiagnosticInput v1.2", () => {
  for (const golden of SEVEN_K_GOLDEN_CASES) {
    assert.deepEqual(validateDiagnosticInput(golden.input), golden.input);
  }
});

test("current totals and archetypes are derived only from current 7K", () => {
  for (const golden of SEVEN_K_GOLDEN_CASES) {
    assert.equal(total(golden.currentScores), golden.currentTotal);
    const archetype = calculateBusinessArchetype(golden.currentScores);
    assert.equal(archetype.totalScore, golden.currentTotal);
    assert.equal(archetype.finalArchetype, golden.currentArchetype);
  }
});

test("target totals are exact and never replace the current archetype input", () => {
  assert.equal(total(ANNA_GOLDEN_CASE.targetScores), 22);
  assert.equal(total(ALINA_GOLDEN_CASE.targetScores), 54);
  assert.equal(calculateBusinessArchetype(ANNA_GOLDEN_CASE.currentScores).finalArchetype, "explorer");
  assert.equal(calculateBusinessArchetype(ALINA_GOLDEN_CASE.currentScores).finalArchetype, "hero");
});

test("Anna next-level target excludes distant scale and autonomy", () => {
  const target = calculateTargetConfiguration({
    currentScores: ANNA_GOLDEN_CASE.currentScores,
    modelFamily: "package_1to1",
    activatedCapabilities: [
      "code_identity",
      "flagship",
      "regular_personal_sales",
      "simple_free_linkage",
    ],
    desiredSystemWeeklyHours: null,
  });

  assert.deepEqual(target.targetScores, ANNA_GOLDEN_CASE.targetScores);
  assert.equal(target.targetScores.blog, ANNA_GOLDEN_CASE.currentScores.blog);
  assert.equal(target.targetScores.team, ANNA_GOLDEN_CASE.currentScores.team);
});

test("Alina next-level target stops at function heads, not autonomous organization", () => {
  const target = calculateTargetConfiguration({
    currentScores: ALINA_GOLDEN_CASE.currentScores,
    modelFamily: "autoproduct",
    activatedCapabilities: ["function_heads"],
    desiredSystemWeeklyHours: 25,
  });

  assert.deepEqual(target.targetScores, ALINA_GOLDEN_CASE.targetScores);
  assert.equal(target.targetScores.team, 8);
  assert.ok(!target.capabilities.includes("management_layer"));
  assert.ok(!target.capabilities.includes("autonomous_org"));
});

test("Anna route uses canonical transitions and does not grow blog or team", () => {
  const resolved = resolveTransitionSequence(ANNA_GOLDEN_CASE.strategy.transitionSequence);
  assert.deepEqual(
    resolved.tasks.map((task) => task.task_id),
    [
      "product_method_1_2",
      "product_method_2_3",
      "product_method_3_4",
      "authenticity_2_3",
      "authenticity_3_4",
      "audience_3_4",
      "sales_technology_2_3",
      "sales_technology_3_4",
      "sales_technology_4_5",
      "funnel_2_3",
    ],
  );
  assert.equal(resolved.tasks.some((task) => task.element_id === "blog"), false);
  assert.equal(resolved.tasks.some((task) => task.element_id === "team"), false);
});

test("Alina route follows delegation maturity before additional scale", () => {
  const resolved = resolveTransitionSequence(ALINA_GOLDEN_CASE.strategy.transitionSequence);
  assert.deepEqual(
    resolved.tasks.map((task) => task.task_id),
    [
      "team_6_7",
      "team_7_8",
      "audience_6_7",
      "audience_7_8",
      "funnel_7_8",
    ],
  );
  assert.equal(resolved.tasks.some((task) => task.element_id === "sales_technology"), false);
  assert.equal(resolved.tasks.some((task) => task.element_id === "product_method"), false);
});

test("Alina source facts stay complete and do not revive the invented dormant 3,000-person base", () => {
  const input = ALINA_GOLDEN_CASE.input;
  assert.match(input.current.products, /бесплатный урок → разбор → продажа основного продукта/u);
  assert.match(input.project.clients, /300–500 тыс\. ₽/u);
  assert.match(input.project.clientPath, /дожимная цепочка/u);
  assert.match(input.project.sales, /технологии переписки/u);
  assert.match(input.project.socialAssets ?? "", /Есть база чат-бота, с ней работают/u);
  assert.match(input.project.socialAssets ?? "", /продающие посты/u);
  assert.doesNotMatch(input.project.socialAssets ?? "", /3 000|давно не делали/u);
  assert.match(input.project.team, /Команда около 15 человек/u);
  assert.match(input.project.team, /Делегированы продажи, переписки/u);
});
