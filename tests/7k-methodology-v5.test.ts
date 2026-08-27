import assert from "node:assert/strict";
import test from "node:test";
import { METHODOLOGY_VERSION } from "../lib/diagnostic-input";
import { EVIDENCE_ROUTING } from "../server/7k/config/evidence-routing.v3.0";
import { SCORING_RULES } from "../server/7k/config/scoring-rules.v3.0";
import { buildP01SystemPrompt } from "../server/p01/request";
import { buildP01ElementScorePrompt, type P01CoreContext } from "../server/p01/split-request";
import { ALINA_GOLDEN_CASE } from "./fixtures/anna-alina-golden";

test("v5.4 scoring separates capability anchors from level boundaries", () => {
  assert.equal(METHODOLOGY_VERSION, "7k.v1.4");
  assert.equal(SCORING_RULES.methodologyVersion, "7K-2026-08-v5.4");
  assert.equal(SCORING_RULES.algorithm, "highest_supported_capability_with_resilience");
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
      assert.ok(Array.isArray(level.boundarySignals));
      assert.ok(level.supportingSignals.length > 0);
      assert.ok(level.blockers.length > 0);
    }
  }
  assert.deepEqual(SCORING_RULES.elements.funnel.levels[7].resilience?.riskFlags, ["single_funnel"]);
  assert.match(SCORING_RULES.elements.product_method.levels[7].resilience?.requirement ?? "", /Авторский метод/u);
  assert.match(SCORING_RULES.elements.sales_technology.levels[8].resilience?.nextTask ?? "", /продлен|допродаж|реактивац/u);
});

test("transitional limitations never remain inside the machine capability core", () => {
  const blog = SCORING_RULES.elements.blog.levels;
  assert.deepEqual(blog[1].mandatoryCore, ["Есть рабочая площадка, первые публикации и подписчики."]);
  assert.match(blog[1].boundarySignals[0] ?? "", /контент выходит редко/iu);
  assert.doesNotMatch(blog[1].mandatoryCore.join(" "), /редко|пока/u);
  assert.match(blog[6].alternativeEvidencePaths.join(" "), /платная механика.+наблюдаемым результатом/u);

  const sales = SCORING_RULES.elements.sales_technology.levels;
  assert.doesNotMatch(sales[2].mandatoryCore.join(" "), /интуитивно/u);
  assert.match(sales[2].boundarySignals.join(" "), /интуитивной/u);
  assert.doesNotMatch(sales[5].mandatoryCore.join(" "), /непоследовательно/u);
  assert.match(sales[5].boundarySignals.join(" "), /непоследовательно/u);
  assert.match(sales[8].alternativeEvidencePaths.join(" "), /продажах, пути клиента, команде.+несколько способных продавцов/u);
  assert.match(sales[8].blockers.join(" "), /Само наличие помощника, менеджера или отдела/u);
  assert.match(sales[9].blockers.join(" "), /повторной выручки и LTV/u);

  for (const element of Object.values(SCORING_RULES.elements)) {
    for (const level of element.levels) {
      const mandatoryCore = level.mandatoryCore.join(" ").toLowerCase();
      for (const boundary of level.boundarySignals) {
        assert.equal(
          mandatoryCore.includes(boundary.toLowerCase()),
          false,
          `${element.elementId}:${level.score} boundary must not be part of mandatoryCore`,
        );
      }
    }
  }
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
  assert.match(prompt, /приобретённую способность и границу уровня/u);
  assert.match(prompt, /boundarySignals/u);
  assert.match(prompt, /прямо доказанную способность/u);
  assert.match(prompt, /единственные точки отказа/u);
  assert.match(prompt, /CRM, бот, AI, реклама, помощник/u);
  assert.match(prompt, /первая продажа до оплаты.+уровень 8/u);
  assert.match(prompt, /уровень 9 требует действующей системы повторных продаж/u);
});

test("Alina blog prompt receives paid growth, owned audience and selling evidence", () => {
  const context = { evidenceLedger: [] } as unknown as P01CoreContext;
  const prompt = buildP01ElementScorePrompt({
    input: ALINA_GOLDEN_CASE.input,
    context,
    elementId: "blog",
  });
  assert.match(prompt, /Telegram-канал около 1 600 подписчиков/u);
  assert.match(prompt, /Аудитория набрана в основном через посевы/u);
  assert.match(prompt, /Есть база чат-бота/u);
  assert.match(prompt, /продающие посты/u);
  assert.match(prompt, /платная механика привлечения подходящей аудитории с наблюдаемым результатом/u);
  assert.match(prompt, /Ограничение нижней ступени нельзя использовать против более высокого уровня/u);
});

test("legacy single-call prompt is normalized to the v5.4 machine policy", () => {
  const prompt = buildP01SystemPrompt(ALINA_GOLDEN_CASE.input, null, { moneyNowEnabled: false });
  assert.doesNotMatch(prompt, /примерно на 80%/u);
  assert.match(prompt, /alternativeEvidencePaths/u);
  assert.match(prompt, /boundarySignals/u);
  assert.match(prompt, /resilience requirement/u);
  assert.match(prompt, /sales_technology=8/u);
  assert.match(prompt, /funnel=6.+уровень 7 требует второго независимого источника.+уровень 8 — второй отличающейся воронки/u);
  assert.match(prompt, /blog=6.+уровень 7 требует минимум двух самостоятельных медиаплощадок/u);
  assert.doesNotMatch(prompt, /Уровни 2–4 требуют фактического использования AI/u);
});
