import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSituationConfirmationInput,
  generateSituationSummary,
} from "../situation-summary";

// The "Ваша ситуация" block is a pre-analysis point A / point B / obstacles
// sanity check, not a business-system read. These tests guard the two things
// most likely to regress silently: the whitelist that keeps client
// results/case studies/best-period/failures out of the confirmation text,
// and the deterministic assembly rules (no dangling "чтобы", no empty
// clauses) that apply on both the AI path and the no-AI fallback.

function noAiEnvironment() {
  // No API key configured -> generateSituationSummary always falls back to
  // the deterministic whitelist-only builder, with zero network calls.
  return {};
}

test("buildSituationConfirmationInput excludes forbidden categories (client results, best period, failures)", () => {
  const input = buildSituationConfirmationInput({
    goalIncome: "500 000 рублей",
    deadline: "6 месяцев",
    goalModel: "наставничество",
    currentIncome: "200 000 рублей",
    products: "консультации",
    struggles: "Не хватает времени на маркетинг.\nНет системы продаж.",
    // Forbidden / out-of-scope categories that must never leak into the
    // whitelist object, per the block's contract:
    result: "Вы провели клиента от отсутствия продаж к запуску на 600 000 рублей",
    bestPeriod: "Лучший месяц был в марте, заработали миллион",
    failures: "Провалили запуск в прошлом году",
    team: "5 нейромаркетологов",
    uniqueness: "Уникальный подход к аутентичности",
    sources: "Instagram и рекомендации",
    clientPath: "Воронка через бесплатный разбор",
    sales: "Продажи через звонки",
    socialAssets: "Канал на 10 000 подписчиков",
    clients: "Онлайн-эксперты",
  });

  const serialized = JSON.stringify(input);
  assert.ok(!serialized.includes("600 000"), "client case-study result leaked into the whitelist object");
  assert.ok(!serialized.includes("миллион"), "best period leaked into the whitelist object");
  assert.ok(!serialized.includes("Провалили"), "past failure leaked into the whitelist object");
  assert.ok(!serialized.includes("нейромаркетолог"), "team assignment info leaked into the whitelist object");
  assert.ok(!serialized.includes("Instagram"), "traffic sources leaked into the whitelist object");

  assert.equal(input.pointB.goalIncome, "**500 000 рублей**");
  assert.equal(input.pointB.deadline, "6 месяцев");
  assert.equal(input.pointB.goalModel, "наставничество");
  assert.equal(input.pointA.currentIncome, "**200 000 рублей**");
  assert.equal(input.pointA.currentModel, "консультации");
  assert.deepEqual(input.perceivedObstacles, ["Не хватает времени на маркетинг.", "Нет системы продаж."]);
});

test("buildSituationConfirmationInput never truncates the obstacle list, however many the client names", () => {
  const obstacleLabels = Array.from({ length: 15 }, (_, index) => `Препятствие номер ${index + 1}.`);
  const input = buildSituationConfirmationInput({
    struggles: obstacleLabels.join("\n"),
  });
  assert.equal(input.perceivedObstacles.length, 15, "all 15 distinct obstacles must be preserved, not capped");
  assert.equal(input.pointB.goalIncome, undefined);
  assert.deepEqual(input.pointB.additionalTargets, []);
});

test("buildSituationConfirmationInput never truncates a single long obstacle", () => {
  const longObstacle = `Подробное препятствие: ${"очень ".repeat(60)}длинное описание проблемы.`;
  const input = buildSituationConfirmationInput({ struggles: longObstacle });
  assert.equal(input.perceivedObstacles.length, 1);
  assert.equal(input.perceivedObstacles[0], longObstacle.trim(), "the full obstacle text must be preserved, not cut short");
});

test("buildSituationConfirmationInput deduplicates near-identical obstacle phrasings", () => {
  const input = buildSituationConfirmationInput({
    struggles: "Не хватает времени на маркетинг.\nНе хватает времени на маркетинг!\nНет системы продаж.",
  });
  assert.equal(input.perceivedObstacles.length, 2);
});

test("buildSituationConfirmationInput reformulates common obstacle phrasings", () => {
  const notUnderstanding = buildSituationConfirmationInput({
    struggles: "Я не понимаю, как перейти на следующий уровень.",
  });
  assert.deepEqual(notUnderstanding.perceivedObstacles, ["Вы не понимаете, как сделать этот переход."]);

  const believesSolution = buildSituationConfirmationInput({
    struggles: "Я думаю, мне поможет найм ассистента.",
  });
  assert.deepEqual(believesSolution.perceivedObstacles, ["Вы считаете, что сделать переход вам поможет найм ассистента."]);
});

test("buildSituationConfirmationInput only surfaces current workload when a workload target was named", () => {
  const withoutTarget = buildSituationConfirmationInput({ weeklyTime: "50" });
  assert.deepEqual(withoutTarget.pointA.currentFacts, []);

  const withTarget = buildSituationConfirmationInput({ weeklyTime: "50", systemTime: "10" });
  assert.ok(withTarget.pointA.currentFacts.some((fact) => fact.includes("50")));
  assert.ok(withTarget.pointB.additionalTargets.some((target) => target.includes("10")));
});

test("generateSituationSummary fallback builds a grammatical text without a dangling motivation clause", async () => {
  const summary = await generateSituationSummary(
    {
      goalIncome: "500 000 рублей",
      deadline: "6 месяцев",
      goalModel: "наставничество",
      currentIncome: "200 000 рублей",
      struggles: "Не хватает системы продаж.",
    },
    noAiEnvironment(),
    "test-session-1",
  );
  assert.equal(summary.source, "fallback");
  assert.ok(!summary.text.includes("чтобы"), "fallback must never fabricate a motivation clause");
  assert.ok(!summary.text.includes("null"));
  assert.ok(!summary.text.includes("undefined"));
  assert.ok(summary.text.includes("**500 000 рублей**"), "goal amount must be wrapped in bold markers");
  assert.ok(summary.text.includes("Не хватает системы продаж."));
  assert.ok(summary.text.includes("**Среди главных препятствий вы называете:**"), "obstacles heading must be bold");
  assert.ok(summary.text.startsWith("Итак, давайте сверимся"));
  assert.ok(summary.text.endsWith("Мы ничего важного не пропустили?"));
});

test("generateSituationSummary fallback generalizes multiple products instead of enumerating them", async () => {
  const singleProduct = await generateSituationSummary(
    { goalIncome: "300 000 рублей", products: "консультации" },
    noAiEnvironment(),
    "test-session-single-product",
  );
  assert.ok(singleProduct.text.includes("вы зарабатываете на консультации"));

  const multipleProducts = await generateSituationSummary(
    { goalIncome: "300 000 рублей", products: "консультации, курсы, наставничество" },
    noAiEnvironment(),
    "test-session-multi-product",
  );
  assert.ok(!multipleProducts.text.includes("консультации, курсы"), "must not enumerate the raw product list");
  assert.ok(multipleProducts.text.includes("несколько продуктов"));
});

test("generateSituationSummary fallback numbers multiple obstacles and omits the section when there are none", async () => {
  const withObstacles = await generateSituationSummary(
    { goalIncome: "300 000 рублей", struggles: "Первое.\nВторое." },
    noAiEnvironment(),
    "test-session-2",
  );
  assert.ok(withObstacles.text.includes("1. Первое."));
  assert.ok(withObstacles.text.includes("2. Второе."));

  const withoutObstacles = await generateSituationSummary(
    { goalIncome: "300 000 рублей" },
    noAiEnvironment(),
    "test-session-3",
  );
  assert.ok(!withoutObstacles.text.includes("препятств"));
});

test("generateSituationSummary throws when there is no whitelisted data at all", async () => {
  await assert.rejects(() =>
    generateSituationSummary({ result: "some client case study" }, noAiEnvironment(), "test-session-4"),
  );
});
