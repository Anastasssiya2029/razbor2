import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { unknownMoneyNowFacts } from "./helpers/p01-v1.4";
import { calculateTargetConfiguration } from "../server/7k/target-configuration";
import {
  TRANSITIONS_70,
  resolveTransitionSequence,
  type ResolvedTransitionSequence,
  type TransitionMilestone,
  type TransitionTask,
} from "../server/7k/transition-resolver";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId, type SevenKScores } from "../server/7k/types";
import type { P01ResultV1_4_2 } from "../server/p01/types";
import type { StoredP02Result } from "../server/p02/stage-types";
import type { P01StrategyContext, P02ResultV1_3, TargetConfigProjection } from "../server/p02/types";
import { sha256 } from "../server/stage4/hash";
import type { TargetArchetypeResourceVersions } from "../server/stage4/types";
import { TaskResolverError } from "../server/task-resolver/errors";
import { buildResolvedTransitionPlan } from "../server/task-resolver/resolve-plan";
import { runTaskResolverStage } from "../server/task-resolver/runner";
import type {
  StoredResolvedTransitionPlan,
  TaskResolverPlanInput,
  TaskResolverRepository,
  TaskResolverSource,
} from "../server/task-resolver/types";

const CURRENT: SevenKScores = {
  authenticity: 4,
  audience: 2,
  product_method: 3,
  sales_technology: 3,
  funnel: 2,
  blog: 2,
  team: 1,
};

const TARGET: SevenKScores = {
  authenticity: 5,
  audience: 6,
  product_method: 5,
  sales_technology: 5,
  funnel: 4,
  blog: 3,
  team: 2,
};

function milestone(
  order: number,
  element_id: SevenKElementId,
  from_score: number,
  to_score: number,
  role: "priority" | "build" = order === 1 ? "priority" : "build",
): P02ResultV1_3["elementSequence"][number] {
  return {
    order,
    element_id,
    role,
    from_score,
    to_score,
    why_now: `Milestone ${order}`,
    prerequisite_elements: [],
    unlocks: [`Signal ${order}`],
    evidence_ids: ["E01"],
  };
}

const BUSINESS_VALIDATION: P02ResultV1_3["businessValidation"] = {
  checkpoint_after_order: 1,
  metric_name: "Факт целевого разговора",
  baseline_value: 0,
  target_value: null,
  unit: "разговоров",
  target_rule: "Зафиксировать фактический сигнал",
  formula: null,
  assumptions: [],
  timeframe_days: 14,
  if_signal_absent: "Переоценить constraint и не продолжать автоматически",
  evidence_ids: ["E01"],
};

function planInput(sequence: P02ResultV1_3["elementSequence"]): TaskResolverPlanInput {
  return { elementSequence: sequence, businessValidation: BUSINESS_VALIDATION, currentScores: CURRENT, targetScores: TARGET };
}

function p01Result(): P01ResultV1_4_2 {
  const current7k = Object.fromEntries(SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, {
    score: CURRENT[elementId],
    confidence: "medium",
    evidence_cap: 10,
    cap_reason: "fixture",
    matched_level_rule_id: `SR2-${elementId}-${CURRENT[elementId]}`,
    next_level_rule_id: `SR2-${elementId}-${CURRENT[elementId] + 1}`,
    evidence_ids: ["E01"],
    counterevidence_ids: [],
    why_not_higher: "Нет следующего доказательства",
    contradiction: null,
    historical_asset: null,
    missing_evidence: [],
  }])) as unknown as P01ResultV1_4_2["current7k"];
  return {
    promptVersion: "P-01.v1.4.2", schemaVersion: "1.4",
    analysisStatus: "ok",
    evidenceLedger: [{ id: "E01", source_field: "project.clients", fact: "Есть фактические разговоры.", evidence_type: "metric_result", time_scope: "current", valence: "neutral", elements: ["audience"], derived_from: [] }],
    current7k,
    businessMap: {
      economics: "Проверяется",
      products: "Пакет",
      audienceResult: "Сегмент уточняется",
      acquisition: "Рекомендации",
      sales: "Разговор",
      assets: "Контакты",
      operations: "Лично",
      uniqueness: "Метод",
      experience: { strugglesSummary: null, bestPeriodSummary: null, failuresSummary: null, attempts: [] },
      capacity: "Есть",
    },
    moneyChainFacts: [{ stage: "next_step", summary: "Базовый сигнал", value: 0, denominator: null, conversionPct: null, period: "месяц", evidence_ids: ["E01"] }],
    moneyNowSignals: [],
    moneyNowFacts: unknownMoneyNowFacts(),
    moneyNowHistory: {} as P01ResultV1_4_2["moneyNowHistory"],
    targetIntent: {
      rawBusinessModel: "Пакет",
      normalizedModelFamily: "package_1to1",
      primaryModelFamily: "package_1to1",
      secondaryModelFamilies: [],
      activatedCapabilities: [],
      desiredRoleSummary: null,
      desiredSystemWeeklyHours: null,
      confidence: "medium",
      missing_evidence: [],
    },
    sanityChecks: [],
  };
}

function p02Result(sequence = [milestone(1, "audience", 2, 5)]): P02ResultV1_3 {
  const active = new Set(sequence.map((item) => item.element_id));
  const priority = sequence.find((item) => item.role === "priority")?.element_id ?? "audience";
  const build = [...active].filter((elementId) => elementId !== priority);
  return {
    promptVersion: "P-02.v1.3",
    schemaVersion: "1.3",
    analysisStatus: "ok",
    constraint: { symptom: "Рост нестабилен", functional_bottleneck: "Не подтверждён следующий шаг", constraint_stage: "next_step", constraint_type: "path_break", root_cause: "Не выбран подтверждённый сегмент", root_evidence_ids: ["E01"], counterevidence_ids: [], confidence: "medium", missing_evidence: [] },
    perceivedVsEvidenced: { client_hypothesis: null, evidenced_bottleneck: "Сегмент не подтверждён", relation: "insufficient_data", explanation: "Факты пока ограничены", evidence_ids: ["E01"] },
    previousAttemptsAnalysis: null,
    candidateAudit: [{ element_id: priority, hypothesis: "Кандидат", supporting_evidence_ids: ["E01"], counterevidence_ids: [], dependency_position: "До продукта", target_necessity: "Нужно для цели", decision: "selected", rejection_reason: null, tie_break_step: null }],
    bundle: {
      priority_element: priority,
      build_elements: build,
      maintain_elements: SEVEN_K_ELEMENT_IDS.filter((elementId) => !active.has(elementId)),
      later_elements: [],
      why_this_bundle: "Минимальный причинный маршрут",
      why_not_now: [],
    },
    elementSequence: sequence,
    businessValidation: { ...BUSINESS_VALIDATION, checkpoint_after_order: sequence[sequence.length - 1].order },
    sanityChecks: [],
  };
}

function targetConfigProjection(target: ReturnType<typeof calculateTargetConfiguration>): TargetConfigProjection {
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

async function sourceWith(sequence = [milestone(1, "audience", 2, 5)]): Promise<TaskResolverSource> {
  const p01 = p01Result();
  const baseTarget = calculateTargetConfiguration({ currentScores: CURRENT, modelFamily: "package_1to1", desiredSystemWeeklyHours: null });
  const target = {
    ...baseTarget,
    requiredMinimum: TARGET,
    targetScores: TARGET,
    gap: Object.fromEntries(SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, TARGET[elementId] - CURRENT[elementId]])) as SevenKScores,
  };
  const result = p02Result(sequence);
  const strategyContext: P01StrategyContext = {
    evidenceLedger: p01.evidenceLedger,
    current7k: p01.current7k,
    businessMap: p01.businessMap,
    moneyChainFacts: p01.moneyChainFacts,
    desiredRoleSummary: p01.targetIntent.desiredRoleSummary,
    desiredSystemWeeklyHours: p01.targetIntent.desiredSystemWeeklyHours,
  };
  const targetConfig = targetConfigProjection(target);
  const p01Hash = await sha256(p01);
  const targetHash = await sha256(target);
  const storedP02: StoredP02Result = {
    id: "p02-1",
    diagnosticId: "diag-1",
    analysisRunId: "run-1",
    p01AnalysisResultId: "p01-1",
    targetArchetypeResultId: "stage4-1",
    p01ResultHash: p01Hash,
    targetResultHash: targetHash,
    promptVersion: "P-02.v1.3",
    outputSchemaVersion: "1.3",
    ruleVersions: { elements: "elements.v1", levelCapabilities: "scoring-rules.v2.0", constraintRules: "constraint-rules.v2.1", dependencyRules: "dependency-rules.v2.1", targetRules: "target-rules.v2.2", transitionLevers: "transition-levers.v1" },
    inputHash: "p02-input",
    strategyContext,
    targetConfig,
    result,
    providerRawResponse: null,
    provider: "mock",
    model: "mock",
    startedAt: "2026-08-18T10:00:00.000Z",
    finishedAt: "2026-08-18T10:00:01.000Z",
    latencyMs: 1,
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
    costUsd: 0,
    retryCount: 0,
    technicalRetryCount: 0,
    reevaluationRetryCount: 0,
    failureCode: null,
    failureMessage: null,
  };
  const resourceVersions: TargetArchetypeResourceVersions = {
    stageVersion: "target-archetype-stage.v1",
    p01PromptVersion: "P-01.v1.4.2",
    p01OutputSchemaVersion: "1.4",
    elements: "elements.v1",
    targetRules: "target-rules.v2.2",
    archetypes: "archetypes.v1",
  };
  return {
    analysisRunId: "run-1",
    diagnosticId: "diag-1",
    runStatus: "resolving_tasks",
    p01: { id: "p01-1", promptVersion: "P-01.v1.4.2", outputSchemaVersion: "1.4", inputHash: "p01-input", result: p01, failureCode: null },
    targetStage: { id: "stage4-1", p01AnalysisResultId: "p01-1", p01InputHash: "p01-input", p01ResultHash: p01Hash, currentScores: CURRENT, target, resourceVersions, deterministicInputHash: "stage4-input", failureCode: null, failureMessage: null },
    p02: storedP02,
  };
}

class MemoryRepository implements TaskResolverRepository {
  stored: StoredResolvedTransitionPlan | null = null;
  updates: Array<{ status: "money_now" | "analysis_failed"; errorCode: string | null }> = [];
  constructor(readonly source: TaskResolverSource) {}
  async loadSource() { return this.source; }
  async loadResult() { return this.stored; }
  async createResult(result: StoredResolvedTransitionPlan) { if (this.stored) return false; this.stored = structuredClone(result); return true; }
  async updateRun(_analysisRunId: string, update: { status: "money_now" | "analysis_failed"; errorCode: string | null }) { this.source.runStatus = update.status; this.updates.push(update); }
}

test("1. selected P-02 candidate uses null tie-break semantics", () => {
  const selected = p02Result().candidateAudit[0];
  assert.equal(selected.decision, "selected");
  assert.equal(selected.tie_break_step, null);
  assert.equal(selected.rejection_reason, null);
});

test("2. rejected P-02 candidate without tie_break_step is rejected by Stage 5 validation", () => {
  const code = readFileSync("server/p02/validation.ts", "utf8");
  assert.match(code, /Rejected candidate tie_break_step must be 0–7/u);
});

test("3. audience 2→5 resolves to exactly three canonical tasks", () => {
  const result = buildResolvedTransitionPlan(planInput([milestone(1, "audience", 2, 5)]));
  assert.deepEqual(result.cards[0].tasks.map((task) => task.taskId), ["audience_2_3", "audience_3_4", "audience_4_5"]);
  assert.equal(result.totalTasks, 3);
  for (const task of result.cards[0].tasks) {
    const canonical = TRANSITIONS_70.find((item) => item.task_id === task.taskId)!;
    assert.equal(task.task, canonical.task);
    assert.equal(task.doneWhen, canonical.done_when);
  }
});

test("4. a 0→10 milestone resolves to ten tasks", () => {
  const current = { ...CURRENT, authenticity: 0 };
  const target = { ...TARGET, authenticity: 10 };
  const result = buildResolvedTransitionPlan({ ...planInput([milestone(1, "authenticity", 0, 10)]), currentScores: current, targetScores: target });
  assert.equal(result.cards[0].tasks.length, 10);
});

test("5. cards of different elements preserve P-02 order", () => {
  const sequence = [milestone(1, "audience", 2, 3), milestone(2, "product_method", 3, 4)];
  assert.deepEqual(buildResolvedTransitionPlan(planInput(sequence)).cards.map((card) => card.elementId), ["audience", "product_method"]);
});

test("6. repeated element milestones remain separate cards", () => {
  const sequence = [milestone(1, "audience", 2, 4), milestone(2, "audience", 4, 6, "priority")];
  const cards = buildResolvedTransitionPlan(planInput(sequence)).cards;
  assert.equal(cards.length, 2);
  assert.deepEqual(cards.map((card) => [card.fromScore, card.toScore]), [[2, 4], [4, 6]]);
});

test("7. duplicate task IDs anywhere in the plan are rejected", () => {
  const duplicateResolver = (sequence: readonly TransitionMilestone[]): ResolvedTransitionSequence => {
    const resolved = structuredClone(resolveTransitionSequence(sequence));
    resolved.milestones[0].transitions[1].task_id = resolved.milestones[0].transitions[0].task_id;
    resolved.tasks = resolved.milestones.flatMap((item) => item.transitions);
    return resolved;
  };
  assert.throws(() => buildResolvedTransitionPlan(planInput([milestone(1, "audience", 2, 4)]), { resolve: duplicateResolver }), TaskResolverError);
});

test("8. missing registry transition is an integrity failure", () => {
  assert.throws(
    () => buildResolvedTransitionPlan(planInput([milestone(1, "audience", 2, 3)]), { registry: TRANSITIONS_70.slice(1) }),
    (error: unknown) => error instanceof TaskResolverError && error.code === "TASK_RESOLVER_REGISTRY_INTEGRITY_FAILED",
  );
});

test("9. modified registry task text is rejected", () => {
  const registry = structuredClone(TRANSITIONS_70) as TransitionTask[];
  const entry = registry.find((item) => item.task_id === "audience_2_3")!;
  entry.task = `${entry.task} rewritten`;
  assert.throws(
    () => buildResolvedTransitionPlan(planInput([milestone(1, "audience", 2, 3)]), { registry }),
    (error: unknown) => error instanceof TaskResolverError && error.code === "TASK_RESOLVER_REGISTRY_CONTENT_MISMATCH",
  );
});

test("10. milestone above persisted target is rejected", () => {
  assert.throws(() => buildResolvedTransitionPlan(planInput([milestone(1, "audience", 2, 7)])), (error: unknown) => error instanceof TaskResolverError && error.code === "TASK_RESOLVER_MILESTONE_ABOVE_TARGET");
});

test("11. first milestone must start at P-01 current score", () => {
  assert.throws(() => buildResolvedTransitionPlan(planInput([milestone(1, "audience", 3, 5)])), (error: unknown) => error instanceof TaskResolverError && error.code === "TASK_RESOLVER_MILESTONE_CHAIN_MISMATCH");
});

test("12. repeated element milestone must continue from prior milestone", () => {
  assert.throws(() => buildResolvedTransitionPlan(planInput([milestone(1, "audience", 2, 4), milestone(2, "audience", 3, 5, "priority")])), TaskResolverError);
});

test("13. resolver cannot add or remove a P-02 milestone", () => {
  const extraResolver = (sequence: readonly TransitionMilestone[]): ResolvedTransitionSequence => {
    const resolved = resolveTransitionSequence(sequence);
    return { ...resolved, milestones: [...resolved.milestones, resolved.milestones[0]] };
  };
  assert.throws(() => buildResolvedTransitionPlan(planInput([milestone(1, "audience", 2, 3)]), { resolve: extraResolver }), (error: unknown) => error instanceof TaskResolverError && error.code === "TASK_RESOLVER_MILESTONE_COUNT_MISMATCH");
});

test("14. legacy products_method ID is rejected", () => {
  const legacy = milestone(1, "product_method", 3, 4) as unknown as P02ResultV1_3["elementSequence"][number];
  (legacy as unknown as { element_id: string }).element_id = "products_method";
  assert.throws(() => buildResolvedTransitionPlan(planInput([legacy])), (error: unknown) => error instanceof TaskResolverError && error.code === "TASK_RESOLVER_INVALID_ELEMENT_ID");
});

test("15. blocked P-02 never invokes the resolver", async () => {
  const source = await sourceWith();
  source.p02!.result!.analysisStatus = "blocked_by_inconsistency";
  const repository = new MemoryRepository(source);
  let calls = 0;
  const result = await runTaskResolverStage("run-1", { repository, resolvePlan: (input) => { calls += 1; return buildResolvedTransitionPlan(input); }, createId: () => "resolver-1" });
  assert.equal(result.status, "analysis_failed");
  assert.equal(calls, 0);
});

test("16. valid low_confidence P-02 is allowed", async () => {
  const source = await sourceWith();
  source.p02!.result!.analysisStatus = "low_confidence";
  const result = await runTaskResolverStage("run-1", { repository: new MemoryRepository(source), createId: () => "resolver-1" });
  assert.equal(result.status, "money_now");
});

test("17. identical upstream and versions replay immutable result", async () => {
  const repository = new MemoryRepository(await sourceWith());
  const first = await runTaskResolverStage("run-1", { repository, createId: () => "resolver-1" });
  const second = await runTaskResolverStage("run-1", { repository, createId: () => "resolver-2" });
  assert.equal(first.idempotentReplay, false);
  assert.equal(second.idempotentReplay, true);
  assert.equal(second.result.id, "resolver-1");
});

test("18. changed upstream after persistence returns TASK_RESOLVER_VERSION_CONFLICT", async () => {
  const repository = new MemoryRepository(await sourceWith());
  await runTaskResolverStage("run-1", { repository, createId: () => "resolver-1" });
  repository.source.p02!.result!.elementSequence[0].to_score = 4;
  await assert.rejects(() => runTaskResolverStage("run-1", { repository }), (error: unknown) => error instanceof TaskResolverError && error.code === "TASK_RESOLVER_VERSION_CONFLICT");
});

test("19. lifecycle advances resolving_tasks to money_now only", async () => {
  const repository = new MemoryRepository(await sourceWith());
  const result = await runTaskResolverStage("run-1", { repository, createId: () => "resolver-1" });
  assert.equal(result.status, "money_now");
  assert.equal(repository.source.runStatus, "money_now");
  assert.equal(repository.updates.at(-1)?.status, "money_now");
});

test("20. regression guard: Task Resolver uses existing resolver and has no AI/Money Now/P-03/P-04 calls", () => {
  const resolver = readFileSync("server/task-resolver/resolve-plan.ts", "utf8");
  const runner = readFileSync("server/task-resolver/runner.ts", "utf8");
  const route = readFileSync("app/api/analysis-runs/[analysisRunId]/resolve-tasks/route.ts", "utf8");
  assert.match(resolver, /resolveTransitionSequence/u);
  assert.doesNotMatch(`${resolver}\n${runner}`, /OpenRouter|P-03|P-04|selectMoneyNowCandidate/u);
  assert.match(route, /moneyNowSelectorStarted: false/u);
  assert.doesNotMatch(route, /elementSequence|taskIds|doneWhen/u);
});

test("ResolvedTransitionPlan preserves businessValidation without semantic rewriting", () => {
  const input = planInput([milestone(1, "audience", 2, 5)]);
  assert.deepEqual(buildResolvedTransitionPlan(input).businessValidation, input.businessValidation);
});

test("Task Resolver storage is additive and immutable per analysis run", () => {
  const schema = readFileSync("db/schema.ts", "utf8");
  const migration = readFileSync("drizzle/0005_strange_ego.sql", "utf8");
  assert.match(schema, /resolvedTransitionPlans/);
  assert.match(schema, /resolved_transition_plans_run_unique/);
  assert.match(schema, /p02ResultHash/);
  assert.match(schema, /targetResultHash/);
  assert.match(migration, /CREATE TABLE `resolved_transition_plans`/u);
  assert.match(migration, /FOREIGN KEY \(`p02_analysis_result_id`\)/u);
});
