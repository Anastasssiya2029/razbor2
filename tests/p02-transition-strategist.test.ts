import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { unknownMoneyNowFacts } from "./helpers/p01-v1.4";
import type { DiagnosticInputV1_2 } from "../lib/diagnostic-input";
import { MONEY_NOW_SCENARIO_IDS } from "../server/7k/config/money-now.v2.2";
import {
  projectTransitionLevers,
  TRANSITION_LEVER_POLICY,
} from "../server/7k/config/p02-strategy-rules.v2.1";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId, type SevenKScores } from "../server/7k/types";
import { computeTargetAndArchetype } from "../server/stage4/compute";
import type { Stage4Source, StoredTargetArchetypeResult } from "../server/stage4/types";
import { P02Error } from "../server/p02/errors";
import { assertDesiredRoleConsistency, prepareP02Input, type P02UpstreamSource } from "../server/p02/projections";
import { buildP02SystemPrompt } from "../server/p02/request";
import { P02RunExecutionError, runP02TransitionStrategist } from "../server/p02/runner";
import { runP02Stage } from "../server/p02/stage-runner";
import type { P02Repository, StoredP02Result } from "../server/p02/stage-types";
import type { P02Provider, P02ProviderRequest, P02ProviderResponse, P02ResultV1_3 } from "../server/p02/types";
import { P02InvariantError, P02SchemaValidationError, normalizeP02CanonicalFields, validateP02Invariants, validateP02Schema } from "../server/p02/validation";
import type { P01ResultV1_4_2 } from "../server/p01/types";

const SCORES: SevenKScores = { authenticity: 4, audience: 4, product_method: 2, sales_technology: 3, funnel: 2, blog: 1, team: 1 };

function diagnostic(): DiagnosticInputV1_2 {
  return {
    schemaVersion: "1.2",
    identity: { expertName: "Мария", niche: "Консалтинг" },
    current: { monthlyRevenueRub: 120000, monthlyRevenueContext: null, payingClientsCount: 4, clientsCountPeriod: "month", weeklyHours: 30, products: "Пакет", bestSeller: "Пакет", freeProducts: null },
    target: { monthlyRevenueRub: 300000, businessModel: "Пакетная работа", deadlineMonths: 6, delegation: "Оставить стратегию лично", desiredSystemWeeklyHours: null },
    project: { clients: "Эксперты", result: "Система продаж", sources: "Рекомендации", clientPath: "Встреча → оффер", sales: "Диагностика", socialAssets: "Telegram", team: "Одна", uniqueness: "Стратегия" },
    experience: { struggles: "Кажется, нужна реклама", bestPeriod: "Личные приглашения давали продажи", failures: "Реклама дала встречи без оплат" },
  };
}

function p01(scores = SCORES): P01ResultV1_4_2 {
  const ledger = SEVEN_K_ELEMENT_IDS.map((id, index) => ({
    id: `E0${index + 1}`,
    source_field: index === 3 ? "experience.failures" : `project.${id}`,
    fact: index === 3 ? "Рекламный тест дал встречи без оплат." : `Факт ${id}.`,
    evidence_type: (index === 3 ? "metric_result" : "current_example") as "metric_result" | "current_example",
    time_scope: (index === 3 ? "historical_only" : "current") as "historical_only" | "current",
    valence: "neutral" as const,
    elements: [id],
    derived_from: [],
  }));
  const current7k = Object.fromEntries(SEVEN_K_ELEMENT_IDS.map((id, index) => [id, {
    score: scores[id], confidence: "medium", evidence_cap: 10, cap_reason: "fixture",
    matched_level_rule_id: `SR2-${id.toUpperCase()}-${String(scores[id]).padStart(2, "0")}`,
    next_level_rule_id: scores[id] < 10 ? `SR2-${id.toUpperCase()}-${String(scores[id] + 1).padStart(2, "0")}` : null,
    evidence_ids: [`E0${index + 1}`], counterevidence_ids: [], why_not_higher: "Не доказано", contradiction: null, historical_asset: null, missing_evidence: [],
  }])) as P01ResultV1_4_2["current7k"];
  const history = Object.fromEntries(MONEY_NOW_SCENARIO_IDS.map((id) => [id, {
    history_status: "not_reported", new_material_condition: "not_applicable", condition_codes: [], summary: null,
    evidence_ids: [], new_condition_evidence_ids: [], confidence: "low",
  }])) as P01ResultV1_4_2["moneyNowHistory"];
  return {
    promptVersion: "P-01.v1.4.2", schemaVersion: "1.4", analysisStatus: "ok", evidenceLedger: ledger, current7k,
    businessMap: {
      economics: "120 000 ₽", products: "Пакет не объяснён", audienceResult: "Эксперты", acquisition: "Реклама",
      sales: "Встречи без оплат", assets: "Telegram", operations: "Лично", uniqueness: "Стратегия",
      experience: { strugglesSummary: "Кажется, нужна реклама", bestPeriodSummary: "Приглашения давали продажи", failuresSummary: "Реклама дала встречи без оплат", attempts: [{ attempt: "Реклама", actual_result: "Встречи без оплат", client_explanation: "Слабый трафик", time_scope: "historical_only", evidence_ids: ["E04"] }] },
      capacity: "30 часов",
    },
    moneyChainFacts: [{ stage: "payment", summary: "Встречи без оплат", value: 0, denominator: 4, conversionPct: 0, period: "месяц", evidence_ids: ["E04"] }],
    moneyNowSignals: [],
    moneyNowFacts: unknownMoneyNowFacts(), moneyNowHistory: history,
    targetIntent: { rawBusinessModel: "Пакетная работа", normalizedModelFamily: "package_1to1", primaryModelFamily: "package_1to1", secondaryModelFamilies: [], activatedCapabilities: [{ code: "regular_personal_sales", reason: "Нужна регулярная личная технология продаж.", source_fields: ["target.businessModel"] }], desiredRoleSummary: null, desiredSystemWeeklyHours: null, confidence: "medium", missing_evidence: [] },
    sanityChecks: [],
  };
}

function stage4Source(result = p01()): Stage4Source {
  return { analysisRunId: "run-1", diagnosticId: "diag-1", runStatus: "targeting", normalizedInput: diagnostic(), p01AnalysisResultId: "p01-1", p01PromptVersion: "P-01.v1.4.2", p01OutputSchemaVersion: "1.4", p01InputHash: "p01-input", p01Result: result, p01FailureCode: null, p01FailureMessage: null };
}

function upstream(result = p01()): P02UpstreamSource {
  const computation = computeTargetAndArchetype(stage4Source(result));
  const targetStage: StoredTargetArchetypeResult = {
    id: "stage4-1", diagnosticId: "diag-1", analysisRunId: "run-1", p01AnalysisResultId: "p01-1", p01InputHash: "p01-input", p01ResultHash: "p01-result",
    currentScores: computation.currentScores, targetInput: computation.targetInput, target: computation.target, archetype: computation.archetype,
    resourceVersions: computation.resourceVersions, deterministicInputHash: "stage4-input", startedAt: "2026-08-18T10:00:00.000Z", completedAt: "2026-08-18T10:00:01.000Z", failureCode: null, failureMessage: null,
  };
  return { analysisRunId: "run-1", diagnosticId: "diag-1", runStatus: "strategizing", p01AnalysisResultId: "p01-1", p01PromptVersion: "P-01.v1.4.2", p01OutputSchemaVersion: "1.4", p01InputHash: "p01-input", p01Result: result, p01FailureCode: null, targetStage };
}

function output(): P02ResultV1_3 {
  return {
    promptVersion: "P-02.v1.3", schemaVersion: "1.3", analysisStatus: "ok",
    constraint: { symptom: "Встречи не дают оплат", functional_bottleneck: "Разрыв offer→payment", constraint_stage: "offer", constraint_type: "path_break", root_cause: "Клиент не понимает законченный продукт", root_evidence_ids: ["E03"], counterevidence_ids: [], confidence: "medium", missing_evidence: [] },
    perceivedVsEvidenced: { client_hypothesis: "Нужна реклама", evidenced_bottleneck: "Есть встречи, но нет оплат", relation: "differs", explanation: "Факты показывают разрыв после интереса", evidence_ids: ["E04"] },
    previousAttemptsAnalysis: { attempts_summary: ["Тест рекламы дал встречи без оплат"], repeated_break_pattern: null, why_not_stable: "Оплата не появилась", route_difference: "Сначала проверить ясность продукта", confidence: "medium", evidence_ids: ["E04"] },
    candidateAudit: [
      { element_id: "product_method", hypothesis: "Неясен продукт", supporting_evidence_ids: ["E03"], counterevidence_ids: [], dependency_position: "До продаж", target_necessity: "Нужен пакет", decision: "selected", rejection_reason: null, tie_break_step: null },
      { element_id: "sales_technology", hypothesis: "Слабая продажа", supporting_evidence_ids: ["E04"], counterevidence_ids: [], dependency_position: "После продукта", target_necessity: "Нужна технология", decision: "rejected", rejection_reason: "Сначала определить продукт", tie_break_step: 1 },
    ],
    bundle: {
      priority_element: "product_method", build_elements: [], maintain_elements: ["authenticity", "blog", "team"],
      later_elements: ["audience", "sales_technology", "funnel"].map((element_id) => ({ element_id: element_id as SevenKElementId, reason: "После проверки", return_trigger: "Когда продукт понятен" })),
      why_this_bundle: "Продукт причинно предшествует продаже", why_not_now: [],
    },
    elementSequence: [{ order: 1, element_id: "product_method", role: "priority", from_score: 2, to_score: 3, why_now: "Нужен пакет", prerequisite_elements: [], unlocks: ["Проверка оплаты"], evidence_ids: ["E03"] }],
    businessValidation: { checkpoint_after_order: 1, metric_name: "Факт оплаты после оффера", baseline_value: 0, target_value: null, unit: "оплат", target_rule: "Зафиксировать реальный сигнал", formula: null, assumptions: [], timeframe_days: 30, if_signal_absent: "Переоценить constraint и не продолжать автоматически", evidence_ids: ["E04"] },
    sanityChecks: [],
  };
}

function prepared(result = p01()) { return prepareP02Input(upstream(result)); }

class QueueProvider implements P02Provider {
  readonly provider = "mock"; readonly model = "mock-p02"; readonly requests: P02ProviderRequest[] = [];
  constructor(private readonly queue: Array<unknown | Error>) {}
  async complete(request: P02ProviderRequest): Promise<P02ProviderResponse> {
    this.requests.push(request); const value = this.queue.shift(); if (value instanceof Error) throw value;
    return { text: typeof value === "string" ? value : JSON.stringify(value), rawResponse: { attempt: this.requests.length }, usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, costUsd: 0.001 } };
  }
}

function withPriority(base: P02ResultV1_3, id: SevenKElementId, current: number, target: number): P02ResultV1_3 {
  const next = structuredClone(base); next.bundle.priority_element = id; next.bundle.build_elements = [];
  next.bundle.maintain_elements = SEVEN_K_ELEMENT_IDS.filter((item) => item !== id); next.bundle.later_elements = [];
  next.candidateAudit = [{ element_id: id, hypothesis: "Кандидат", supporting_evidence_ids: ["E01"], counterevidence_ids: [], dependency_position: "Причинный узел", target_necessity: "Нужен цели", decision: "selected", rejection_reason: null, tie_break_step: null }];
  next.elementSequence = [{ order: 1, element_id: id, role: "priority", from_score: current, to_score: target, why_now: "Проверяем", prerequisite_elements: [], unlocks: ["Сигнал"], evidence_ids: ["E01"] }];
  return next;
}

test("1. lowest score is not an automatic constraint", () => assert.doesNotThrow(() => validateP02Invariants(validateP02Schema(output()), prepared())));
test("2. largest target gap is not an automatic priority", () => { const input = prepared(); assert.ok(input.targetConfig.gap.sales_technology > input.targetConfig.gap.product_method); assert.equal(output().bundle.priority_element, "product_method"); });
test("3. Product root precedes Sales when it is unclear what is sold", () => { const prompt = buildP02SystemPrompt(prepared().strategyContext, prepared().targetConfig); assert.match(prompt, /непонятно что покупают → product priority/u); });
test("4. non-target meetings route Audience or Funnel before automatic Sales", () => assert.match(buildP02SystemPrompt(prepared().strategyContext, prepared().targetConfig), /нецелевые встречи → audience и\/или funnel/u));
test("5. gratitude alone never proves overconsulting", () => assert.match(buildP02SystemPrompt(prepared().strategyContext, prepared().targetConfig), /Благодарность сама по себе недостаточна/u));
test("6. normal sales plus low-owner-time target allows owner_dependency/team priority", () => assert.match(buildP02SystemPrompt(prepared().strategyContext, prepared().targetConfig), /constraint может быть `owner_dependency\/team`/u));
test("soft elements cannot become the main money-transition element", () => {
  const input = prepared();
  input.targetConfig.targetScores.audience = input.currentScores.audience + 1;
  const value = withPriority(output(), "audience", input.currentScores.audience, input.targetConfig.targetScores.audience);
  assert.throws(() => validateP02Invariants(value, input), P02InvariantError);
  assert.match(buildP02SystemPrompt(input.strategyContext, input.targetConfig), /authenticity и audience могут быть только build\/supporting/u);
});
test("a low sales technology accompanies a selected product in the nearest linkage", () => {
  const input = prepared();
  input.currentScores.sales_technology = 2;
  input.strategyContext.current7k.sales_technology.score = 2;
  const value = output();
  assert.throws(() => validateP02Invariants(value, input), P02InvariantError);
  value.bundle.build_elements = ["sales_technology"];
  value.bundle.later_elements = value.bundle.later_elements.filter((item) => item.element_id !== "sales_technology");
  value.elementSequence.push({
    order: 2,
    element_id: "sales_technology",
    role: "build",
    from_score: 2,
    to_score: 3,
    why_now: "Нужна простая структура продажи пакета",
    prerequisite_elements: ["product_method"],
    unlocks: ["Проверка предложения"],
    evidence_ids: ["E04"],
  });
  assert.doesNotThrow(() => validateP02Invariants(value, input));
});
test("P-02 prompt embeds the exact root output contract", () => {
  const prompt = buildP02SystemPrompt(prepared().strategyContext, prepared().targetConfig);
  const match = prompt.match(/<P02_OUTPUT_SCHEMA_JSON>\n([\s\S]+?)\n<\/P02_OUTPUT_SCHEMA_JSON>/u);
  assert.ok(match);
  const schema = JSON.parse(match[1]) as { additionalProperties: boolean; required: string[] };
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    "promptVersion",
    "schemaVersion",
    "analysisStatus",
    "constraint",
    "perceivedVsEvidenced",
    "previousAttemptsAnalysis",
    "candidateAudit",
    "bundle",
    "elementSequence",
    "businessValidation",
    "sanityChecks",
  ]);
  assert.match(prompt, /Не добавляй другие корневые поля/u);
});
test("P-02 receives fail-closed transition levers without task text", () => {
  const current = { ...SCORES, authenticity: 2 };
  const target = { ...current, authenticity: 3 };
  const levers = projectTransitionLevers(current, target);
  assert.deepEqual(levers.elements.authenticity, [{
    from_score: 2,
    to_score: 3,
    revenue_lever: "Доверие к эксперту",
    revenue_mechanism: "Связывает уникальность эксперта с результатом клиента и усиливает доказательность предложения.",
  }]);
  assert.ok(SEVEN_K_ELEMENT_IDS.filter((elementId) => elementId !== "authenticity").every(
    (elementId) => levers.elements[elementId].length === 0,
  ));
  assert.equal(TRANSITION_LEVER_POLICY.isRevenuePromise, false);
  assert.equal(TRANSITION_LEVER_POLICY.taskTextAvailableToP02, false);
  const input = prepared();
  input.strategyContext.current7k.authenticity.score = 2;
  input.targetConfig.targetScores.authenticity = 3;
  const prompt = buildP02SystemPrompt(input.strategyContext, input.targetConfig);
  assert.match(prompt, /relevantTransitionLevers/u);
  assert.match(prompt, /Доверие к эксперту/u);
  assert.doesNotMatch(prompt, /Сформулировать своё «почему я»/u);
});
test("P-02 prompt treats nearest and vision models as an intentional staged transition", () => {
  const input = prepared();
  input.targetConfig.visionModelFamily = "autoproduct";
  input.targetConfig.visionModelComponents = ["autoproduct"];
  input.targetConfig.modelTransitionNote = "Сначала пакет, затем автономный продукт.";
  const prompt = buildP02SystemPrompt(input.strategyContext, input.targetConfig);
  assert.match(prompt, /Различие между ближайшей и дальней моделью намеренно/u);
  assert.match(prompt, /НЕ является TARGET_CONFIG_INCONSISTENCY/u);
  assert.match(prompt, /Стратегию ближайшего перехода собирай по modelFamily и targetScores/u);
});
test("P-02 prompt exposes the same exact baseline allowlist enforced by backend", () => {
  const prompt = buildP02SystemPrompt(prepared().strategyContext, prepared().targetConfig);
  assert.match(prompt, /Разрешённые точные числа для businessValidation baseline_value: \[0,4\]/u);
  assert.match(prompt, /если подходящего числа нет, верни null/u);
  assert.match(prompt, /Не извлекай baseline_value из свободного текста/u);
});
test("7. perceived ads need may differ from evidenced offer→payment leak", () => assert.equal(output().perceivedVsEvidenced.relation, "differs"));
test("8. perceived struggles may honestly match evidence", () => { const value = output(); value.perceivedVsEvidenced.relation = "matches"; assert.doesNotThrow(() => validateP02Invariants(value, prepared())); });
test("9. repeated-break pattern requires repeated persisted attempts", () => { const result = p01(); result.businessMap.experience.attempts.push({ ...result.businessMap.experience.attempts[0], attempt: "Партнёрский запуск" }); const value = output(); value.previousAttemptsAnalysis!.repeated_break_pattern = "Две попытки дали встречи без оплат"; assert.doesNotThrow(() => validateP02Invariants(value, prepared(result))); });
test("10. no failures requires previousAttemptsAnalysis=null", () => { const result = p01(); result.businessMap.experience.failuresSummary = null; result.businessMap.experience.attempts = []; const value = output(); value.previousAttemptsAnalysis = null; assert.doesNotThrow(() => validateP02Invariants(value, prepared(result))); });
test("11. repeated old route without new condition gets targeted reevaluation then block", async () => { const first = output(); first.sanityChecks = [{ code: "REPEATED_SOLUTION_WITHOUT_NEW_CONDITION", severity: "error", message: "Старое решение повторяется", element_ids: ["funnel"], evidence_ids: ["E04"] }]; const blocked = output(); blocked.analysisStatus = "blocked_by_inconsistency"; blocked.bundle = { priority_element: null, build_elements: [], maintain_elements: [...SEVEN_K_ELEMENT_IDS], later_elements: [], why_this_bundle: "Нельзя продолжать", why_not_now: [] }; blocked.elementSequence = []; blocked.candidateAudit = []; blocked.sanityChecks = [{ code: "REPEATED_SOLUTION_WITHOUT_NEW_CONDITION", severity: "warning", message: "Нужна новая предпосылка", element_ids: ["funnel"], evidence_ids: ["E04"] }]; const provider = new QueueProvider([first, blocked]); const result = await runP02TransitionStrategist(prepared(), { provider }); assert.equal(result.kind, "blocked"); assert.equal(provider.requests.length, 2); });
test("12. priority/build with zero gap is rejected", () => { const input = prepared(); const value = withPriority(output(), "team", 1, 2); assert.throws(() => validateP02Invariants(value, input), P02InvariantError); });
test("13. milestone above persisted target is rejected", () => { const value = output(); value.elementSequence[0].to_score = 4; assert.throws(() => validateP02Invariants(value, prepared()), P02InvariantError); });
test("14. broken repeated milestone chain is rejected", () => { const value = output(); value.elementSequence.push({ ...value.elementSequence[0], order: 2, from_score: 2, to_score: 3 }); value.businessValidation.checkpoint_after_order = 2; assert.throws(() => validateP02Invariants(value, prepared()), P02InvariantError); });
test("15. checkpoint outside sequence is rejected", () => { const value = output(); value.businessValidation.checkpoint_after_order = 2; assert.throws(() => validateP02Invariants(value, prepared()), P02InvariantError); });
test("16. dangling evidence is rejected", () => { const value = output(); value.constraint.root_evidence_ids = ["E99"]; assert.throws(() => validateP02Invariants(value, prepared()), P02InvariantError); });
test("17. more than two build elements fails schema", () => { const value = output() as unknown as { bundle: { build_elements: string[] } }; value.bundle.build_elements = ["audience", "funnel", "team"]; assert.throws(() => validateP02Schema(value), P02SchemaValidationError); });
test("18. broken 7K partition is rejected", () => { const value = output(); value.bundle.maintain_elements = value.bundle.maintain_elements.filter((id) => id !== "team"); assert.throws(() => validateP02Invariants(value, prepared()), P02InvariantError); });
test("19. unknown ID and legacy products_method are rejected", () => { const value = output() as unknown as { bundle: { priority_element: string } }; value.bundle.priority_element = "products_method"; assert.throws(() => validateP02Schema(value), P02SchemaValidationError); });
test("20. explicit desiredRoleSummary conflict returns TARGET_CONFIG_INCONSISTENCY", () => { const input = prepared(); assert.throws(() => assertDesiredRoleConsistency("Передать продажи менеджеру", input.targetConfig), (error: unknown) => error instanceof P02Error && error.code === "TARGET_CONFIG_INCONSISTENCY"); });
test("21. transport failure gets at most one technical retry", async () => { const provider = new QueueProvider([new Error("network"), output()]); const result = await runP02TransitionStrategist(prepared(), { provider }); assert.equal(result.kind, "success"); assert.equal(result.metadata.technicalRetryCount, 1); });
test("21a. an exact markdown JSON fence is accepted without a paid retry", async () => { const provider = new QueueProvider([`\`\`\`json\n${JSON.stringify(output())}\n\`\`\``]); const result = await runP02TransitionStrategist(prepared(), { provider }); assert.equal(result.kind, "success"); assert.equal(result.metadata.technicalRetryCount, 0); assert.equal(provider.requests.length, 1); });
test("21b. malformed JSON fails after one paid provider response", async () => { const provider = new QueueProvider(["Ответ: {}", output()]); await assert.rejects(() => runP02TransitionStrategist(prepared(), { provider }), (error: unknown) => error instanceof P02RunExecutionError && error.failureCode === "P02_MALFORMED_JSON"); assert.equal(provider.requests.length, 1); });
test("21c. schema-invalid JSON fails after one paid provider response", async () => { const provider = new QueueProvider([{}, output()]); await assert.rejects(() => runP02TransitionStrategist(prepared(), { provider }), (error: unknown) => error instanceof P02RunExecutionError && error.failureCode === "P02_SCHEMA_VALIDATION_FAILED"); assert.equal(provider.requests.length, 1); });
test("22. semantic invariant gets one targeted reevaluation", async () => { const broken = output(); broken.constraint.root_evidence_ids = ["E99"]; const provider = new QueueProvider([broken, output()]); const result = await runP02TransitionStrategist(prepared(), { provider }); assert.equal(result.kind, "success"); assert.equal(result.metadata.reevaluationRetryCount, 1); assert.match(provider.requests[1].correction ?? "", /backend semantic invariants/u); });
test("22a. reevaluation explains unsupported baselines and intentional target staging", async () => {
  const broken = output();
  broken.businessValidation.baseline_value = 120000;
  broken.sanityChecks = [{ code: "TARGET_CONFIG_INCONSISTENCY", severity: "error", message: "Ближняя и дальняя модели различаются", element_ids: ["product_method"], evidence_ids: ["E03"] }];
  const provider = new QueueProvider([broken, output()]);
  const result = await runP02TransitionStrategist(prepared(), { provider });
  assert.equal(result.kind, "success");
  assert.equal(provider.requests.length, 2);
  assert.match(provider.requests[1].correction ?? "", /baseline_value=null/u);
  assert.match(provider.requests[1].correction ?? "", /намеренным поэтапным переходом/u);
});
test("P-02 canonicalizes zero-gap build elements and clamps milestones to persisted target", () => {
  const input = prepared();
  const value = output();
  value.bundle.build_elements = ["team"];
  value.bundle.maintain_elements = value.bundle.maintain_elements.filter((id) => id !== "team");
  value.elementSequence[0].to_score = 10;
  value.elementSequence.push({
    ...value.elementSequence[0],
    order: 2,
    element_id: "team",
    role: "build",
    from_score: input.currentScores.team,
    to_score: input.currentScores.team + 1,
  });
  value.businessValidation.checkpoint_after_order = 2;

  const normalized = normalizeP02CanonicalFields(value, input);

  assert.deepEqual(normalized.bundle.build_elements, []);
  assert.ok(normalized.bundle.maintain_elements.includes("team"));
  assert.deepEqual(normalized.elementSequence.map((step) => ({
    order: step.order,
    element_id: step.element_id,
    from_score: step.from_score,
    to_score: step.to_score,
  })), [{
    order: 1,
    element_id: "product_method",
    from_score: input.currentScores.product_method,
    to_score: input.targetConfig.targetScores.product_method,
  }]);
  assert.equal(normalized.businessValidation.checkpoint_after_order, 1);
  assert.equal(validateP02Invariants(normalized, input), normalized);
});
test("P-02 canonicalizes duplicate and missing bundle roles into one exact 7K partition", () => {
  const input = prepared();
  const value = output();
  value.bundle.build_elements = ["sales_technology", "sales_technology"];
  value.bundle.maintain_elements = ["authenticity", "sales_technology"];
  value.bundle.later_elements = [
    { element_id: "audience", reason: "Позже", return_trigger: "После проверки" },
    { element_id: "audience", reason: "Дубликат", return_trigger: "Позже" },
    { element_id: "sales_technology", reason: "Конфликт", return_trigger: "Позже" },
  ];
  value.elementSequence.push({
    ...value.elementSequence[0],
    order: 2,
    element_id: "sales_technology",
    role: "build",
    from_score: input.currentScores.sales_technology,
    to_score: input.currentScores.sales_technology + 1,
  });

  const normalized = normalizeP02CanonicalFields(value, input);
  const roles = [
    normalized.bundle.priority_element,
    ...normalized.bundle.build_elements,
    ...normalized.bundle.maintain_elements,
    ...normalized.bundle.later_elements.map((item) => item.element_id),
  ];

  assert.deepEqual([...roles].sort(), [...SEVEN_K_ELEMENT_IDS].sort());
  assert.equal(new Set(roles).size, SEVEN_K_ELEMENT_IDS.length);
  assert.equal(validateP02Invariants(normalized, input), normalized);
});
test("final P-02 validation failure persists only safe issue codes and paths", async () => {
  const broken = output();
  broken.constraint.root_evidence_ids = ["E99"];
  const provider = new QueueProvider([broken, broken]);
  await assert.rejects(
    () => runP02TransitionStrategist(prepared(), { provider }),
    (error: unknown) =>
      error instanceof Error &&
      /dangling_evidence_id@\/constraint\/root_evidence_ids\/0/u.test(error.message) &&
      !error.message.includes(broken.businessValidation.if_signal_absent),
  );
});
test("selected candidate has null tie-break step and rejection reason", () => { const selected = output().candidateAudit.find((candidate) => candidate.decision === "selected"); assert.equal(selected?.tie_break_step, null); assert.equal(selected?.rejection_reason, null); assert.doesNotThrow(() => validateP02Invariants(output(), prepared())); });
test("rejected candidate without tie-break step is rejected", () => { const value = output(); const rejected = value.candidateAudit.find((candidate) => candidate.decision === "rejected")!; rejected.tie_break_step = null; assert.throws(() => validateP02Invariants(value, prepared()), P02InvariantError); });
test("selected candidate with a tie-break step is rejected", () => { const value = output(); const selected = value.candidateAudit.find((candidate) => candidate.decision === "selected")!; selected.tie_break_step = 0; assert.throws(() => validateP02Invariants(value, prepared()), P02InvariantError); });

class MemoryRepository implements P02Repository {
  stored: StoredP02Result | null = null;
  constructor(readonly source: P02UpstreamSource) {}
  async loadSource() { return this.source; }
  async loadResult() { return this.stored; }
  async createResult(result: StoredP02Result) { if (this.stored) return false; this.stored = structuredClone(result); return true; }
  async updateRun(_id: string, update: { status: "resolving_tasks" | "analysis_failed" }) { this.source.runStatus = update.status; }
}

test("23. same upstream and versions replay the persisted P-02 result", async () => { const repository = new MemoryRepository(upstream()); const first = await runP02Stage("run-1", { repository, provider: new QueueProvider([output()]), createId: () => "p02-1" }); const second = await runP02Stage("run-1", { repository, provider: new QueueProvider([]) }); assert.equal(first.status, "resolving_tasks"); assert.equal(second.idempotentReplay, true); assert.equal(second.result.id, "p02-1"); });
test("failed P-02 snapshot also replays idempotently without another provider call", async () => { const source = upstream(); const repository = new MemoryRepository(source); const blocked = output(); blocked.analysisStatus = "blocked_by_inconsistency"; blocked.bundle = { priority_element: null, build_elements: [], maintain_elements: [...SEVEN_K_ELEMENT_IDS], later_elements: [], why_this_bundle: "Нельзя продолжать", why_not_now: [] }; blocked.elementSequence = []; blocked.candidateAudit = []; const first = await runP02Stage("run-1", { repository, provider: new QueueProvider([blocked]) }); const second = await runP02Stage("run-1", { repository, provider: new QueueProvider([]) }); assert.equal(first.status, "analysis_failed"); assert.equal(second.status, "analysis_failed"); assert.equal(second.idempotentReplay, true); });
test("24. changed upstream after persistence returns explicit version conflict", async () => { const repository = new MemoryRepository(upstream()); await runP02Stage("run-1", { repository, provider: new QueueProvider([output()]) }); repository.source.p01Result!.businessMap.sales = "changed"; await assert.rejects(() => runP02Stage("run-1", { repository, provider: new QueueProvider([]) }), (error: unknown) => error instanceof P02Error && error.code === "P02_VERSION_CONFLICT"); });
test("25. regression guard preserves stages 1–4 and excludes forbidden P-02 inputs/actions", () => { const repositoryCode = readFileSync("server/p02/repository.ts", "utf8"); const routeCode = readFileSync("app/api/analysis-runs/[analysisRunId]/p02/route.ts", "utf8"); assert.doesNotMatch(repositoryCode, /diagnostics|normalizedInputJson|rawAnswersJson|archetypeResultJson/u); assert.doesNotMatch(routeCode, /resolveTransitionSequence|MoneyNow|P-03|P-04|AnalysisResult/u); const prompt = buildP02SystemPrompt(prepared().strategyContext, prepared().targetConfig); assert.doesNotMatch(prompt, /moneyNowSignals|moneyNowHistory|providerRawResponse|products_method/u); assert.match(prompt, /product_method/u); });
test("P01_STRATEGY_CONTEXT and TARGET_CONFIG projections have exact approved keys", () => { const input = prepared(); assert.deepEqual(Object.keys(input.strategyContext).sort(), ["businessMap", "current7k", "desiredRoleSummary", "desiredSystemWeeklyHours", "evidenceLedger", "moneyChainFacts"].sort()); assert.deepEqual(Object.keys(input.targetConfig).sort(), ["appliedModifiers", "capabilities", "desiredOwnerRole", "gap", "modelComponents", "modelFamily", "modelTransitionNote", "requiredMinimum", "targetScores", "visionModelComponents", "visionModelFamily"].sort()); });
test("P-02 storage is additive, immutable per run and preserves server-only provider response", () => { const schema = readFileSync("db/schema.ts", "utf8"); const migration = readFileSync("drizzle/0004_many_absorbing_man.sql", "utf8"); assert.match(schema, /p02AnalysisResults/); assert.match(schema, /providerRawResponseJson/); assert.match(migration, /p02_analysis_results_run_unique/); assert.match(migration, /FOREIGN KEY \(`p01_analysis_result_id`\)/); assert.match(migration, /FOREIGN KEY \(`target_archetype_result_id`\)/); });
