import assert from "node:assert/strict";
import test from "node:test";
import { calculateBusinessArchetype, calculateTargetConfiguration } from "../server/7k";
import type { SevenKScores } from "../server/7k/types";
import {
  assembleAnalysisResult,
  authorizeAnalysisResultDebugRequest,
  getOrCreateAnalysisResult,
  validateAnalysisResult,
  type AnalysisResultRepository,
  type AnalysisResultSource,
  type AnalysisResultV1,
  type StoredAnalysisResult,
} from "../server/analysis-result";
import type { TargetConfigProjection } from "../server/p02/types";
import { buildResolvedTransitionPlan } from "../server/task-resolver/resolve-plan";
import { stableJson } from "../server/stage4/hash";
import { makeAnalysisResultFixture, refreshAnalysisResultFixture } from "./helpers/analysis-result-fixture";

class MemoryAnalysisResultRepository implements AnalysisResultRepository {
  stored: StoredAnalysisResult | null = null;
  constructor(readonly source: AnalysisResultSource) {}
  async loadSource() { return this.source; }
  async loadResult() { return this.stored; }
  async createResult(result: StoredAnalysisResult) {
    if (this.stored) return false;
    this.stored = structuredClone(result);
    return true;
  }
}

function targetProjection(target: ReturnType<typeof calculateTargetConfiguration>): TargetConfigProjection {
  return {
    modelFamily: target.modelFamily,
    modelComponents: target.modelComponents,
    requiredMinimum: target.requiredMinimum,
    targetScores: target.targetScores,
    gap: target.gap,
    capabilities: target.capabilities,
    appliedModifiers: target.appliedModifiers,
    desiredOwnerRole: target.desiredOwnerRole,
  };
}

function assertNoForbiddenServerData(value: unknown): void {
  const json = JSON.stringify(value);
  for (const forbidden of [
    "providerRawResponse",
    "rawAnswersJson",
    "normalizedInputJson",
    "OPENROUTER_API_KEY",
    "candidateTrace",
    "rankingTrace",
    "selectorInput",
  ]) assert.equal(json.includes(forbidden), false, forbidden);
}

function assertExactImmutableJoin(source: AnalysisResultSource, result: AnalysisResultV1): void {
  assert.ok(source.p03 && source.p04 && source.p04.result);
  assert.deepEqual(result.current.current7k, source.p04.context.current.current7k);
  assert.deepEqual(result.target, source.p04.context.target);
  assert.deepEqual(result.archetype, source.p04.context.archetype);
  assert.deepEqual(result.strategy.bundle, source.p04.context.strategy.bundle);
  assert.deepEqual(result.route, source.p04.context.resolvedPlan);
  assert.deepEqual(result.moneyNow.selectedScenario, source.p04.context.moneyNow.selectedScenario);
  assert.deepEqual(result.moneyNow.prescription, source.p03.result);
  assert.deepEqual(result.report, source.p04.result);
  assert.deepEqual(result.finalFocus, source.p04.result.finalFocus);
  assert.equal(result.finalFocus.first_task_id, result.route.cards[0].tasks[0].taskId);
  assert.equal(result.finalFocus.first_action, result.route.cards[0].tasks[0].task);
  assert.equal(result.report.routeCards.some((card) => "tasks" in card || "interventions" in card), false);
  assertNoForbiddenServerData(result);
  validateAnalysisResult(result);
}

async function assertDeterministicFixture(source: AnalysisResultSource): Promise<AnalysisResultV1> {
  const first = await assembleAnalysisResult(source);
  const second = await assembleAnalysisResult(structuredClone(source));
  assert.equal(stableJson(first), stableJson(second));
  assertExactImmutableJoin(source, first);
  const repository = new MemoryAnalysisResultRepository(source);
  const created = await getOrCreateAnalysisResult(source.analysisRunId, { repository, createId: () => "final-1" });
  const replayed = await getOrCreateAnalysisResult(source.analysisRunId, { repository, createId: () => "final-2" });
  assert.equal(created.idempotentReplay, false);
  assert.equal(replayed.idempotentReplay, true);
  assert.deepEqual(replayed.result, created.result);
  return first;
}

test("E2E 1: normal result preserves available Money Now prescription", async () => {
  const source = await makeAnalysisResultFixture("available");
  source.p03!.providerRawResponse = { authorization: "fixture-secret-must-not-leak" };
  source.p04!.providerRawResponse = { raw: "fixture-provider-payload" };
  const result = await assertDeterministicFixture(source);
  assert.equal(result.moneyNow.status, "available");
  assert.equal(result.moneyNow.selectedScenario?.scenario_id, "MN14");
  assert.deepEqual(result.moneyNow.prescription, source.p03!.result);
});

test("E2E 2: no_eligible_scenario has no fallback", async () => {
  const source = await makeAnalysisResultFixture("no_eligible_scenario");
  const result = await assertDeterministicFixture(source);
  assert.equal(result.moneyNow.status, "no_eligible_scenario");
  assert.equal(result.moneyNow.selectedScenario, null);
  assert.equal(result.moneyNow.prescription, null);
  assert.equal(result.moneyNow.skippedOutcome?.reason, "no_eligible_scenario");
});

test("E2E 3: insufficient evidence remains blocked", async () => {
  const source = await makeAnalysisResultFixture("blocked_insufficient_evidence");
  const result = await assertDeterministicFixture(source);
  assert.equal(result.moneyNow.status, "blocked_insufficient_evidence");
  assert.equal(result.moneyNow.prescription?.analysisStatus, "blocked_by_insufficient_evidence");
  assert.equal(result.moneyNow.prescription?.diagnosis.primary_cause_code, null);
  assert.equal(result.moneyNow.prescription?.diagnosis.cause_statement, null);
});

test("E2E 4: inconsistent evidence remains blocked", async () => {
  const source = await makeAnalysisResultFixture("blocked_inconsistency");
  const result = await assertDeterministicFixture(source);
  assert.equal(result.moneyNow.status, "blocked_inconsistency");
  assert.equal(result.moneyNow.prescription?.analysisStatus, "blocked_by_inconsistency");
});

test("E2E 5: low confidence propagates without rewriting decisions", async () => {
  const source = await makeAnalysisResultFixture("available");
  source.p04!.context.current.analysisStatus = "low_confidence";
  await refreshAnalysisResultFixture(source);
  const result = await assertDeterministicFixture(source);
  assert.equal(result.analysisStatus, "low_confidence");
  assert.equal(result.moneyNow.selectedScenario?.scenario_id, "MN14");
});

test("E2E 6: archetype gate downgrade is preserved exactly", async () => {
  const source = await makeAnalysisResultFixture("available");
  const scores: SevenKScores = {
    authenticity: 6,
    audience: 2,
    product_method: 5,
    sales_technology: 5,
    funnel: 2,
    blog: 6,
    team: 6,
  };
  for (const [elementId, score] of Object.entries(scores)) {
    source.p04!.context.current.current7k[elementId as keyof SevenKScores].score = score;
  }
  const target = calculateTargetConfiguration({
    currentScores: scores,
    modelFamily: "package_1to1",
    desiredSystemWeeklyHours: null,
  });
  source.p04!.context.target = targetProjection(target);
  source.p04!.context.archetype = calculateBusinessArchetype(scores);
  await refreshAnalysisResultFixture(source);
  const result = await assertDeterministicFixture(source);
  assert.equal(result.archetype.candidateArchetype, "hero");
  assert.equal(result.archetype.finalArchetype, "creator");
  assert.notEqual(result.archetype.downgradeReason, null);
});

test("E2E 7: repeated milestones for one element remain separate cards", async () => {
  const source = await makeAnalysisResultFixture("available");
  const original = source.p04!.context.strategy.elementSequence[0];
  source.p04!.context.strategy.elementSequence = [
    { ...structuredClone(original), order: 1, from_score: 2, to_score: 3 },
    { ...structuredClone(original), order: 2, role: "build", from_score: 3, to_score: 5 },
  ];
  source.p04!.context.resolvedPlan = buildResolvedTransitionPlan({
    elementSequence: source.p04!.context.strategy.elementSequence,
    businessValidation: source.p04!.context.strategy.businessValidation,
    currentScores: Object.fromEntries(Object.entries(source.p04!.context.current.current7k).map(([key, value]) => [key, value.score])) as SevenKScores,
    targetScores: source.p04!.context.target.targetScores,
  });
  await refreshAnalysisResultFixture(source);
  const result = await assertDeterministicFixture(source);
  assert.equal(result.route.cards.length, 2);
  assert.deepEqual(result.route.cards.map((card) => [card.elementId, card.fromScore, card.toScore]), [
    ["audience", 2, 3],
    ["audience", 3, 5],
  ]);
});

test("E2E 8: failed historical intervention stays blocked without a new condition and allowed with proof", async () => {
  const blocked = await makeAnalysisResultFixture("blocked_inconsistency");
  blocked.p03!.result!.interventionHistoryReview = [{
    intervention_code: "INT_QUALIFY_BEFORE_SALE",
    match_status: "matched",
    matched_attempt_evidence_ids: ["E09"],
    new_condition_status: "not_confirmed",
    new_condition_evidence_ids: [],
    conclusion: "blocked_repeat_without_new_condition",
  }];
  blocked.p03!.deterministicInputHash = "history-blocked";
  await refreshAnalysisResultFixture(blocked);
  const blockedResult = await assertDeterministicFixture(blocked);
  assert.equal(blockedResult.moneyNow.status, "blocked_inconsistency");
  assert.equal(blockedResult.moneyNow.prescription?.interventionHistoryReview[0].conclusion, "blocked_repeat_without_new_condition");

  const allowed = await makeAnalysisResultFixture("available");
  const allowedResult = await assertDeterministicFixture(allowed);
  assert.equal(allowedResult.moneyNow.status, "available");
  assert.equal(allowedResult.moneyNow.prescription?.interventionHistoryReview[0].new_condition_status, "confirmed");
  assert.equal(allowedResult.moneyNow.prescription?.interventionHistoryReview[0].conclusion, "clear_to_test");
});

test("E2E 9: direct self-value evidence permits zero-step while tactical ad doubt does not", async () => {
  const selfValue = await makeAnalysisResultFixture("available");
  selfValue.p03!.result!.businessPrescription!.zero_step = {
    duration_days: 3,
    task: "Зафиксировать доказательства ценности до следующего рыночного действия.",
    market_action: "Назвать цену без предварительного снижения.",
    evidence_ids: ["E01"],
  };
  selfValue.p03!.deterministicInputHash = "self-value-zero-step";
  await refreshAnalysisResultFixture(selfValue);
  const selfValueResult = await assertDeterministicFixture(selfValue);
  assert.equal(selfValueResult.moneyNow.prescription?.businessPrescription?.zero_step?.duration_days, 3);

  const tacticalDoubt = await makeAnalysisResultFixture("available");
  tacticalDoubt.p03!.deterministicInputHash = "tactical-ad-doubt";
  await refreshAnalysisResultFixture(tacticalDoubt);
  const tacticalResult = await assertDeterministicFixture(tacticalDoubt);
  assert.equal(tacticalResult.moneyNow.prescription?.businessPrescription?.zero_step, null);
});

test("E2E 10: no capacity and no proven Money Now facts cannot fabricate a scenario", async () => {
  const source = await makeAnalysisResultFixture("no_eligible_scenario");
  source.p04!.context.current.businessMap.capacity = "Нет свободной ёмкости для нового клиента.";
  await refreshAnalysisResultFixture(source);
  const result = await assertDeterministicFixture(source);
  assert.equal(result.moneyNow.status, "no_eligible_scenario");
  assert.equal(result.moneyNow.selectionStatus, "no_eligible_scenario");
  assert.equal(result.moneyNow.selectedScenario, null);
  assert.equal(result.moneyNow.prescription, null);
});

test("internal debug guard is fail-closed and token protected", () => {
  const request = (token?: string) => new Request("https://example.test/api/internal/result", {
    headers: token ? { "x-analysis-debug-token": token } : {},
  });
  assert.equal(authorizeAnalysisResultDebugRequest(request(), {}).code, "ANALYSIS_DEBUG_DISABLED");
  assert.equal(authorizeAnalysisResultDebugRequest(request(), { ANALYSIS_DEBUG_ENABLED: "true" }).code, "ANALYSIS_DEBUG_NOT_CONFIGURED");
  assert.equal(authorizeAnalysisResultDebugRequest(request("wrong"), { ANALYSIS_DEBUG_ENABLED: "true", ANALYSIS_DEBUG_TOKEN: "right" }).code, "ANALYSIS_DEBUG_UNAUTHORIZED");
  assert.deepEqual(authorizeAnalysisResultDebugRequest(request("right"), { ANALYSIS_DEBUG_ENABLED: "true", ANALYSIS_DEBUG_TOKEN: "right" }), { allowed: true });
});
