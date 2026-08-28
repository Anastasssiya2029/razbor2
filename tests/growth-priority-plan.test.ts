import assert from "node:assert/strict";
import test from "node:test";
import type { AnalysisResultV1 } from "../server/analysis-result";
import { growthRole, orderedGrowthElements, resolveGrowthPriorityPlan } from "../lib/growth-priority-plan";

function resultFixture(): AnalysisResultV1 {
  return {
    current: { scores: { authenticity: 2, audience: 2, product_method: 1, sales_technology: 2, funnel: 3, blog: 1, team: 1 } },
    target: { targetScores: { authenticity: 4, audience: 4, product_method: 3, sales_technology: 4, funnel: 3, blog: 1, team: 1 } },
    strategy: { bundle: { priority_element: "product_method", build_elements: ["audience"] } },
    route: { cards: [{ elementId: "audience" }, { elementId: "product_method" }, { elementId: "authenticity" }, { elementId: "sales_technology" }] },
  } as unknown as AnalysisResultV1;
}

test("the Anna scenario keeps product and sales as the core linkage", () => {
  const plan = resolveGrowthPriorityPlan(resultFixture());
  assert.deepEqual(plan.core, ["product_method", "sales_technology"]);
  assert.deepEqual(plan.supporting, ["audience", "authenticity"]);
  assert.deepEqual(plan.deferred, []);
  assert.equal(growthRole(plan, "product_method"), "Ключевой элемент");
  assert.equal(growthRole(plan, "sales_technology"), "Ключевой элемент");
  assert.equal(growthRole(plan, "audience"), "Поддерживающий элемент");
  assert.deepEqual(orderedGrowthElements(plan), ["product_method", "sales_technology", "audience", "authenticity"]);
});

test("a soft upstream priority cannot become the main element", () => {
  const result = resultFixture();
  result.strategy.bundle.priority_element = "audience";
  result.strategy.bundle.build_elements = ["sales_technology"];
  const plan = resolveGrowthPriorityPlan(result);
  assert.equal(plan.core[0], "sales_technology");
  assert.equal(growthRole(plan, "audience"), "Поддерживающий элемент");
});

test("sales cannot be displaced from a product-led core by extra build elements", () => {
  const result = resultFixture();
  result.strategy.bundle.build_elements = ["funnel", "team"];
  result.target.targetScores.funnel = 4;
  result.target.targetScores.team = 2;
  const plan = resolveGrowthPriorityPlan(result);
  assert.deepEqual(plan.core, ["product_method", "sales_technology"]);
  assert.deepEqual(plan.supporting, ["audience", "authenticity", "funnel", "team"]);
  assert.deepEqual(plan.deferred, []);
});

test("key and supporting elements are ordered by the number of missing levels", () => {
  const result = resultFixture();
  result.target.targetScores.product_method = 3;
  result.target.targetScores.sales_technology = 5;
  result.target.targetScores.authenticity = 5;
  result.target.targetScores.audience = 3;

  const plan = resolveGrowthPriorityPlan(result);

  assert.deepEqual(plan.core, ["sales_technology", "product_method"]);
  assert.deepEqual(plan.supporting, ["authenticity", "audience"]);
  assert.deepEqual(orderedGrowthElements(plan), ["sales_technology", "product_method", "authenticity", "audience"]);
});

test("a hard build element may support the core when soft changes do not fill the support block", () => {
  const result = resultFixture();
  result.target.targetScores.authenticity = result.current.scores.authenticity;
  result.target.targetScores.audience = result.current.scores.audience;
  result.strategy.bundle.priority_element = "funnel";
  result.strategy.bundle.build_elements = ["team"];
  result.target.targetScores.funnel = 4;
  result.target.targetScores.team = 2;
  const plan = resolveGrowthPriorityPlan(result);
  assert.deepEqual(plan.core, ["funnel", "team"]);
});
