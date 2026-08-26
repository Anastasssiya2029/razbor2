import assert from "node:assert/strict";
import test from "node:test";
import { EVIDENCE_ROUTING } from "../server/7k/config/evidence-routing.v3.0";
import { SCORING_RULES } from "../server/7k/config/scoring-rules.v2.0";
import { buildP01ElementScorePrompt, type P01CoreContext } from "../server/p01/split-request";
import { ALINA_GOLDEN_CASE } from "./fixtures/anna-alina-golden";

test("v5 scoring uses cumulative mandatory-core policy with an 80 percent support target", () => {
  assert.equal(SCORING_RULES.methodologyVersion, "7K-2026-08-v5");
  assert.equal(SCORING_RULES.algorithm, "highest_fully_supported_cumulative");
  assert.equal(SCORING_RULES.evaluationPolicy.criterionRole, "mandatory_core");
  assert.equal(SCORING_RULES.evaluationPolicy.supportingCoverageTargetPct, 80);
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
  assert.match(levels[8].criterion, /несколькими сегментами и подсегментами/u);
});

test("product and sales ladders distinguish method, ecosystem and delegation", () => {
  assert.match(SCORING_RULES.elements.product_method.levels[7].criterion, /Авторский метод/u);
  assert.match(SCORING_RULES.elements.product_method.levels[8].criterion, /повторные покупки/u);
  assert.match(SCORING_RULES.elements.sales_technology.levels[8].criterion, /Помощник/u);
  assert.match(SCORING_RULES.elements.sales_technology.levels[9].criterion, /полный цикл продажи до оплаты/u);
  assert.match(SCORING_RULES.elements.sales_technology.levels[10].criterion, /Владелец вышел/u);
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
  assert.match(prompt, /примерно на 80%/u);
  assert.match(prompt, /CRM, бот, AI, реклама, помощник/u);
});
