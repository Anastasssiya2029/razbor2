import assert from "node:assert/strict";
import test from "node:test";
import { METHODOLOGY_VERSION } from "../lib/diagnostic-input";
import { EVIDENCE_ROUTING } from "../server/7k/config/evidence-routing.v3.0";
import { SCORING_RULES } from "../server/7k/config/scoring-rules.v3.0";
import { buildP01SystemPrompt } from "../server/p01/request";
import { buildP01ElementScorePrompt, type P01CoreContext } from "../server/p01/split-request";
import { ALINA_GOLDEN_CASE } from "./fixtures/anna-alina-golden";

test("v5.2 scoring uses explicit cumulative core and resilience without a percentage gate", () => {
  assert.equal(METHODOLOGY_VERSION, "7k.v1.4");
  assert.equal(SCORING_RULES.methodologyVersion, "7K-2026-08-v5.2");
  assert.equal(SCORING_RULES.algorithm, "highest_fully_supported_cumulative");
  assert.equal(SCORING_RULES.evaluationPolicy.criterionRole, "mandatory_core");
  assert.equal(SCORING_RULES.evaluationPolicy.supportingCoveragePolicy, "confidence_only_not_a_score_gate");
  assert.equal(SCORING_RULES.evaluationPolicy.resiliencePolicy, "resilience-rules.v1");
  assert.match(
    SCORING_RULES.evaluationPolicy.blockerPolicy,
    /absence|missing_evidence|отсутствие/iu,
  );
});

test("audience levels reserve multiple segments for level 8 and above", () => {
  const levels = SCORING_RULES.elements.audience.levels;
  assert.doesNotMatch(levels[3].criterion, /несколько сегмент/iu);
  assert.match(levels[6].criterion, /подходящего и неподходящего клиента/u);
  assert.match(levels[7].criterion, /отказывает «не своим»/u);
  assert.match(levels[8].criterion, /минимум два подтверждённых/u);
});

test("product and sales ladders distinguish method, ecosystem and delegation", () => {
  assert.match(SCORING_RULES.elements.product_method.levels[7].criterion, /Авторский метод/u);
  assert.match(SCORING_RULES.elements.product_method.levels[8].criterion, /повторные покупки/u);
  assert.match(SCORING_RULES.elements.sales_technology.levels[8].criterion, /первая продажа до оплаты.+менеджер/u);
  assert.match(SCORING_RULES.elements.sales_technology.levels[9].criterion, /первая и повторная продажи/u);
  assert.match(SCORING_RULES.elements.sales_technology.levels[10].criterion, /Руководитель продаж/u);
});

test("every machine level exposes explicit evidence fields and upper levels expose resilience", () => {
  for (const element of Object.values(SCORING_RULES.elements)) {
    for (const level of element.levels) {
      assert.ok(level.mandatoryCore.length > 0);
      assert.ok(Array.isArray(level.alternativeEvidencePaths));
      assert.ok(level.supportingSignals.length > 0);
      assert.ok(level.blockers.length > 0);
    }
  }
  assert.deepEqual(SCORING_RULES.elements.funnel.levels[7].resilience?.riskFlags, ["single_funnel"]);
  assert.match(SCORING_RULES.elements.product_method.levels[7].resilience?.requirement ?? "", /Авторский метод/u);
  assert.match(SCORING_RULES.elements.sales_technology.levels[8].resilience?.nextTask ?? "", /продлен|допродаж|реактивац/u);
});

test("delegation evidence is routed into every element whose upper levels depend on team roles", () => {
  for (const elementId of ["audience", "product_method", "sales_technology", "funnel", "blog"] as const) {
    assert.ok(EVIDENCE_ROUTING[elementId].currentSources.includes("project.team"));
  }
});

test("Alina sales prompt receives delegated sales facts and cumulative scoring instructions", () => {
  const context = {
    evidenceLedger: [{
      id: "E77",
      source_field: "project.team",
      fact: ALINA_GOLDEN_CASE.input.project.team,
      evidence_type: "documented_model",
      time_scope: "current",
      valence: "positive",
      elements: ["sales_technology", "team"],
      derived_from: [],
    }],
  } as P01CoreContext;
  const prompt = buildP01ElementScorePrompt({
    input: ALINA_GOLDEN_CASE.input,
    context,
    elementId: "sales_technology",
  });
  assert.match(prompt, /project\.team/u);
  assert.match(prompt, /Делегированы продажи/u);
  assert.match(prompt, /обязательное ядро/u);
  assert.match(prompt, /не образуют процентный порог/u);
  assert.match(prompt, /единственные точки отказа/u);
  assert.match(prompt, /CRM, бот, AI, реклама, помощник/u);
  assert.match(prompt, /первая продажа до оплаты.+уровень 8/u);
  assert.match(prompt, /уровень 9 требует действующей системы повторных продаж/u);
});

test("legacy single-call prompt is normalized to the v5.2 machine policy", () => {
  const prompt = buildP01SystemPrompt(ALINA_GOLDEN_CASE.input, null, { moneyNowEnabled: false });
  assert.doesNotMatch(prompt, /примерно на 80%/u);
  assert.match(prompt, /alternativeEvidencePaths/u);
  assert.match(prompt, /resilience requirement/u);
  assert.match(prompt, /sales_technology=8/u);
  assert.match(prompt, /funnel=6.+уровень 7 требует второго независимого источника.+уровень 8 — второй отличающейся воронки/u);
  assert.match(prompt, /blog=6.+уровень 7 требует минимум двух самостоятельных медиаплощадок/u);
});
