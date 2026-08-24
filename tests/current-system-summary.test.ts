import assert from "node:assert/strict";
import test from "node:test";
import type { SystemElementId, SystemScore } from "../lib/business-analysis";
import { buildCurrentSystemSummary } from "../lib/current-system-summary";

const ids: SystemElementId[] = [
  "authenticity",
  "audience",
  "products_method",
  "sales_technology",
  "funnel",
  "blog",
  "team",
];

function scores(values: number[]): SystemScore[] {
  return ids.map((id, index) => ({ id, currentScore: values[index], targetScore: values[index], reasoning: "fixture" }));
}

test("low soft scores explain the missing why-me and proven-client connection", () => {
  const summary = buildCurrentSystemSummary(scores([2, 3, 1, 2, 2, 1, 1]));
  assert.match(summary.soft, /ясное «почему я»/u);
  assert.match(summary.soft, /клиента, который готов заплатить/u);
  assert.match(summary.hard, /не соединены в повторяемую систему/u);
});

test("a strong authenticity score does not hide a weak audience score", () => {
  const summary = buildCurrentSystemSummary(scores([7, 2, 4, 4, 4, 4, 4]));
  assert.match(summary.soft, /кому и за какой результат готовы платить/u);
});

test("one isolated strong hard element is described as an unsupported mechanism", () => {
  const summary = buildCurrentSystemSummary(scores([4, 4, 8, 2, 2, 2, 2]));
  assert.match(summary.hard, /Один механизм уже развит/u);
});

test("a mature hard system is described as repeatable", () => {
  const summary = buildCurrentSystemSummary(scores([7, 7, 8, 7, 9, 7, 6]));
  assert.match(summary.hard, /дают повторяемый результат/u);
});
