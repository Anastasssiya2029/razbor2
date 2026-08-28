import { BUSINESS_ARCHETYPE_BY_ID } from "@/server/7k/config/archetypes.v2";
import { REPORT_GLOSSARY, REPORT_GLOSSARY_VERSION } from "@/server/7k/config/report-glossary.v1";
import { SEVEN_K_ELEMENT_IDS, type SevenKScores } from "@/server/7k/types";
import { validateP01Invariants, validateP01Schema } from "@/server/p01/validation";
import { validateP02Invariants, validateP02Schema } from "@/server/p02/validation";
import { P04_PROMPT_SHA256, P04_PROMPT_VERSION } from "@/server/7k/prompts/p04.v1.2";
import { sha256, stableJson } from "@/server/stage4/hash";
import { P04Error } from "./errors";
import type { P04Source, P04PreparedInput } from "./stage-types";
import {
  P04_OUTPUT_SCHEMA_VERSION,
  P04_REPORT_POLICY_VERSION,
  P04_SOURCE_REGISTRY_VERSION,
  P04_STAGE_VERSION,
  type P04Context,
  type P04MoneyNowStatus,
  type P04ReportPolicy,
  type P04RuleVersions,
  type P04SourceRegistry,
} from "./types";

export const P04_RULE_VERSIONS: P04RuleVersions = {
  requestBuilder: "p04-request-builder.v2",
  p01Prompt: "P-01.v1.4.2",
  p01Schema: "1.4",
  targetStage: "target-archetype-stage.v1",
  targetRules: "target-rules.v2.3",
  archetypes: "archetypes.v2",
  p02Prompt: "P-02.v1.3",
  p02Schema: "1.3",
  taskResolver: "task-resolver-stage.v1",
  transitions: "transitions-70.v2",
  moneyNowSelector: "money-now-selector-stage.v1",
  moneyNowSelectorContract: "money-now-selector-contract.v1.2",
  p03Prompt: "P-03.v1.5",
  p03Schema: "1.5",
  reportPolicy: P04_REPORT_POLICY_VERSION,
  sourceRegistry: P04_SOURCE_REGISTRY_VERSION,
  reportGlossary: REPORT_GLOSSARY_VERSION,
  promptSha256: P04_PROMPT_SHA256,
};

function fail(code: string, message: string, kind: "upstream_blocked" | "validation" | "integrity" | "version_conflict" = "validation"): never {
  throw new P04Error(code, message, kind);
}

function containsForbiddenProjectionKey(value: unknown): string | null {
  const forbidden = new Set([
    "rawAnswers",
    "rawAnswersJson",
    "rawPayload",
    "normalizedInput",
    "normalizedInputJson",
    "providerRawResponse",
    "providerRawResponseJson",
    "candidateAudit",
    "candidateTrace",
    "rankingTrace",
    "selectorInput",
  ]);
  const visit = (candidate: unknown): string | null => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const found = visit(item);
        if (found) return found;
      }
      return null;
    }
    if (!candidate || typeof candidate !== "object") return null;
    for (const [key, nested] of Object.entries(candidate as Record<string, unknown>)) {
      if (forbidden.has(key)) return key;
      const found = visit(nested);
      if (found) return found;
    }
    return null;
  };
  return visit(value);
}

function currentScores(context: P04Context): SevenKScores {
  const scores = Object.fromEntries(
    SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, context.current.current7k[elementId].score]),
  ) as Record<string, number | null>;
  const missing = SEVEN_K_ELEMENT_IDS.filter((elementId) => !Number.isInteger(scores[elementId]));
  if (missing.length) fail("P04_CURRENT_SCORES_INCOMPLETE", `Missing current scores: ${missing.join(", ")}.`, "upstream_blocked");
  return scores as SevenKScores;
}

function buildMoneyNowStatus(context: P04Context): P04MoneyNowStatus {
  if (context.moneyNow.selectionStatus === "no_eligible_scenario") {
    if (
      context.moneyNow.selectedScenario !== null ||
      context.moneyNow.p03OutcomeStatus !== "skipped_no_eligible_scenario" ||
      context.moneyNow.p03Result !== null
    ) {
      fail("P04_MONEY_NOW_INCONSISTENCY", "no_eligible_scenario is inconsistent with persisted P-03 outcome.", "integrity");
    }
    return "no_eligible_scenario";
  }
  if (!context.moneyNow.selectedScenario || !context.moneyNow.p03Result) {
    fail("P04_MONEY_NOW_RESULT_MISSING", "Selected Money Now scenario requires a validated P-03 result.", "upstream_blocked");
  }
  switch (context.moneyNow.p03OutcomeStatus) {
    case "ok":
    case "low_confidence":
      return "available";
    case "blocked_by_insufficient_evidence":
      return "blocked_insufficient_evidence";
    case "blocked_by_inconsistency":
      return "blocked_inconsistency";
    default:
      fail("P04_MONEY_NOW_OUTCOME_UNSUPPORTED", `Unsupported P-03 outcome ${String(context.moneyNow.p03OutcomeStatus)}.`, "integrity");
  }
}

export function buildP04ReportPolicy(context: P04Context): P04ReportPolicy {
  const scores = currentScores(context);
  const firstCard = context.resolvedPlan.cards[0];
  const firstTask = firstCard?.tasks[0];
  if (!firstTask) fail("P04_FIRST_TASK_MISSING", "Resolved plan must contain at least one fixed task.", "upstream_blocked");
  const p03Status = context.moneyNow.p03OutcomeStatus;
  const analysisStatus =
    context.current.analysisStatus === "low_confidence" ||
    context.strategy.analysisStatus === "low_confidence" ||
    context.strategy.constraint.confidence === "low" ||
      p03Status === "low_confidence" ||
      p03Status === "blocked_by_insufficient_evidence" ||
      p03Status === "blocked_by_inconsistency"
      ? "low_confidence"
      : "ok";
  const targetShiftElements = SEVEN_K_ELEMENT_IDS
    .filter((elementId) => context.target.targetScores[elementId] > scores[elementId])
    .map((elementId) => ({
      element_id: elementId,
      from_score: scores[elementId],
      to_score: context.target.targetScores[elementId],
    }));
  const whyNotNowExpected = [
    ...context.strategy.bundle.maintain_elements.map((element_id) => ({
      element_id,
      status: "maintain" as const,
      return_trigger:
        context.strategy.bundle.why_not_now.find((item) => item.element_id === element_id)
          ?.return_trigger ?? null,
    })),
    ...context.strategy.bundle.later_elements.map((item) => ({
      element_id: item.element_id,
      status: "later" as const,
      return_trigger: item.return_trigger,
    })),
  ];
  return {
    version: P04_REPORT_POLICY_VERSION,
    analysisStatus,
    moneyNowStatus: buildMoneyNowStatus(context),
    firstTask: { taskId: firstTask.taskId, task: firstTask.task },
    validationSignal: context.strategy.businessValidation.target_rule,
    targetShiftElements,
    whyNotNowExpected,
    routeCardIdentities: context.resolvedPlan.cards.map((card) => ({
      card_id: card.cardId,
      order: card.order,
      element_id: card.elementId,
      role: card.role,
      from_score: card.fromScore,
      to_score: card.toScore,
      task_ids: card.tasks.map((task) => task.taskId),
    })),
  };
}

export function buildP04SourceRegistry(context: P04Context): P04SourceRegistry {
  const refs = new Set<string>([
    "P01:businessMap",
    "TARGET:model",
    "ARCHETYPE:current",
    "P02:constraint",
    "P02:bundle",
    "P02:validation",
    "MN:selection",
    "P03:outcome",
    "P03:locked_teaser",
  ]);
  context.current.evidenceLedger.forEach((evidence) => refs.add(`P01:${evidence.id}`));
  SEVEN_K_ELEMENT_IDS.forEach((elementId) => {
    refs.add(`P01:current7k:${elementId}`);
    refs.add(`TARGET:${elementId}`);
  });
  context.strategy.elementSequence.forEach((item) => refs.add(`P02:sequence:${item.order}`));
  context.resolvedPlan.cards.forEach((card) => {
    refs.add(`PLAN:card:${card.cardId}`);
    card.tasks.forEach((task) => refs.add(`TASK:${task.taskId}`));
  });
  if (context.moneyNow.p03Result?.diagnosis) refs.add("P03:diagnosis");
  if (context.moneyNow.p03Result?.businessPrescription) refs.add("P03:prescription");
  if (context.moneyNow.p03Result?.test30d) refs.add("P03:test");
  return { version: P04_SOURCE_REGISTRY_VERSION, refs: [...refs].sort() };
}

function validateResolvedPlan(context: P04Context): void {
  const plan = context.resolvedPlan;
  if (plan.stageVersion !== "task-resolver-stage.v1" || plan.transitionRegistryVersion !== "transitions-70.v2") {
    fail("P04_RESOLVED_PLAN_VERSION_UNSUPPORTED", "P-04 requires task-resolver-stage.v1/transitions-70.v2.", "upstream_blocked");
  }
  if (stableJson(plan.businessValidation) !== stableJson(context.strategy.businessValidation)) {
    fail("P04_BUSINESS_VALIDATION_CONFLICT", "Resolved plan changed P-02 businessValidation.", "integrity");
  }
  if (plan.cards.length !== context.strategy.elementSequence.length) {
    fail("P04_ROUTE_CARD_COUNT_CONFLICT", "Resolved cards must match P-02 milestones one-to-one.", "integrity");
  }
  plan.cards.forEach((card, index) => {
    const milestone = context.strategy.elementSequence[index];
    if (
      card.order !== milestone.order ||
      card.elementId !== milestone.element_id ||
      card.role !== milestone.role ||
      card.fromScore !== milestone.from_score ||
      card.toScore !== milestone.to_score ||
      card.tasks.length === 0
    ) {
      fail("P04_ROUTE_CARD_IDENTITY_CONFLICT", `Resolved card ${card.cardId} differs from P-02 milestone ${index + 1}.`, "integrity");
    }
  });
  const taskIds = plan.cards.flatMap((card) => card.tasks.map((task) => task.taskId));
  if (stableJson(taskIds) !== stableJson(plan.taskIds) || plan.totalTasks !== taskIds.length) {
    fail("P04_TASK_IDENTITY_CONFLICT", "Resolved task IDs/count are internally inconsistent.", "integrity");
  }
}

export async function prepareP04Input(source: P04Source): Promise<P04PreparedInput> {
  const p01 = source.p01;
  const target = source.targetStage;
  const p02 = source.p02;
  const resolved = source.resolvedPlan;
  const selection = source.moneyNowSelection;
  const p03 = source.p03;

  if (!p01.id || !p01.result || p01.failureCode) fail("P04_P01_MISSING", "Successful persisted P-01 is required.", "upstream_blocked");
  if (p01.promptVersion !== "P-01.v1.4.2" || p01.outputSchemaVersion !== "1.4") fail("P04_P01_VERSION_UNSUPPORTED", "P-04 requires P-01.v1.4.2/schema 1.4.", "upstream_blocked");
  validateP01Invariants(validateP01Schema(p01.result));
  if (p01.result.analysisStatus !== "ok" && p01.result.analysisStatus !== "low_confidence") fail("P04_P01_BLOCKED", `P-01 status ${p01.result.analysisStatus} is not reportable.`, "upstream_blocked");

  if (!target || target.failureCode || !target.target || !target.archetype || !target.currentScores) fail("P04_TARGET_MISSING", "Successful persisted Target + Archetype is required.", "upstream_blocked");
  if (target.resourceVersions.stageVersion !== "target-archetype-stage.v1" || target.resourceVersions.targetRules !== "target-rules.v2.3" || target.resourceVersions.archetypes !== "archetypes.v2") fail("P04_TARGET_VERSION_UNSUPPORTED", "Target/Archetype versions are unsupported.", "upstream_blocked");

  if (!p02 || p02.failureCode || !p02.result) fail("P04_P02_MISSING", "Valid persisted P-02 is required.", "upstream_blocked");
  if (p02.promptVersion !== "P-02.v1.3" || p02.outputSchemaVersion !== "1.3") fail("P04_P02_VERSION_UNSUPPORTED", "P-04 requires P-02.v1.3/schema 1.3.", "upstream_blocked");
  if (p02.result.analysisStatus !== "ok" && p02.result.analysisStatus !== "low_confidence") fail("P04_P02_BLOCKED", `P-02 status ${p02.result.analysisStatus} is not reportable.`, "upstream_blocked");

  if (!resolved || resolved.failureCode || !resolved.plan) fail("P04_RESOLVED_PLAN_MISSING", "Successful persisted Task Resolver plan is required.", "upstream_blocked");
  if (!selection || selection.failure || !selection.snapshot) fail("P04_MONEY_NOW_SELECTION_MISSING", "Successful persisted Stage 7 selection is required.", "upstream_blocked");
  if (
    selection.stageVersion !== "money-now-selector-stage.v1" ||
    selection.selectorContractVersion !== "money-now-selector-contract.v1.2"
  ) fail("P04_MONEY_NOW_VERSION_UNSUPPORTED", "P-04 requires Stage 7 selector contract v1.2.", "upstream_blocked");
  if (!p03 || p03.failureCode) fail("P04_P03_MISSING", "Valid persisted P-03 stage outcome is required.", "upstream_blocked");
  if (p03.promptVersion !== "P-03.v1.5" || p03.outputSchemaVersion !== "1.5") fail("P04_P03_VERSION_UNSUPPORTED", "P-04 requires P-03.v1.5/schema 1.5.", "upstream_blocked");
  if (!p03.result && !p03.skippedOutcome) fail("P04_P03_OUTCOME_MISSING", "P-03 has neither a validated result nor skipped outcome.", "upstream_blocked");

  if (
    target.p01AnalysisResultId !== p01.id ||
    p02.p01AnalysisResultId !== p01.id ||
    p02.targetArchetypeResultId !== target.id ||
    resolved.p01AnalysisResultId !== p01.id ||
    resolved.targetArchetypeResultId !== target.id ||
    resolved.p02AnalysisResultId !== p02.id ||
    selection.p01AnalysisResultId !== p01.id ||
    selection.taskResolverPlanId !== resolved.id ||
    p03.p01AnalysisResultId !== p01.id ||
    p03.moneyNowSelectionId !== selection.id
  ) fail("P04_UPSTREAM_ID_CONFLICT", "Persisted upstream modules do not reference one immutable run chain.", "version_conflict");

  const p01ResultHash = await sha256(p01.result);
  const targetResultHash = await sha256(target.target);
  const targetArchetypeResultHash = await sha256({ target: target.target, archetype: target.archetype });
  const p02ResultHash = await sha256(p02.result);
  const resolvedTransitionPlanHash = await sha256(resolved.plan);
  const moneyNowSelectionHash = await sha256(selection.snapshot);
  const p03ResultHash = await sha256(p03.result ?? p03.skippedOutcome);
  if (
    target.p01ResultHash !== p01ResultHash ||
    p02.p01ResultHash !== p01ResultHash ||
    selection.p01ResultHash !== p01ResultHash ||
    p03.p01ResultHash !== p01ResultHash ||
    p02.targetResultHash !== targetResultHash ||
    resolved.targetResultHash !== targetResultHash ||
    resolved.p02ResultHash !== p02ResultHash ||
    selection.taskResolverPlanHash !== resolvedTransitionPlanHash ||
    p03.moneyNowSelectionHash !== moneyNowSelectionHash
  ) fail("P04_UPSTREAM_HASH_CONFLICT", "Persisted upstream hashes do not match current immutable snapshots.", "version_conflict");

  const context: P04Context = {
    current: {
      analysisStatus: p01.result.analysisStatus,
      evidenceLedger: structuredClone(p01.result.evidenceLedger),
      current7k: structuredClone(p01.result.current7k),
      businessMap: structuredClone(p01.result.businessMap),
    },
    target: {
      modelFamily: target.target.modelFamily,
      modelComponents: structuredClone(target.target.modelComponents),
      visionModelFamily: target.target.visionModelFamily,
      visionModelComponents: structuredClone(target.target.visionModelComponents),
      modelTransitionNote: target.target.modelTransitionNote,
      requiredMinimum: structuredClone(target.target.requiredMinimum),
      targetScores: structuredClone(target.target.targetScores),
      gap: structuredClone(target.target.gap),
      capabilities: structuredClone(target.target.capabilities),
      appliedModifiers: structuredClone(target.target.appliedModifiers),
      desiredOwnerRole: target.target.desiredOwnerRole,
    },
    archetype: structuredClone(target.archetype),
    strategy: {
      analysisStatus: p02.result.analysisStatus,
      constraint: structuredClone(p02.result.constraint),
      bundle: structuredClone(p02.result.bundle),
      elementSequence: structuredClone(p02.result.elementSequence),
      businessValidation: structuredClone(p02.result.businessValidation),
      perceivedVsEvidenced: structuredClone(p02.result.perceivedVsEvidenced),
      previousAttemptsAnalysis: structuredClone(p02.result.previousAttemptsAnalysis),
    },
    resolvedPlan: structuredClone(resolved.plan),
    moneyNow: {
      selectionStatus: selection.snapshot.selectionStatus,
      selectedScenario: selection.snapshot.selectedScenario && p03.selectedScenario
        ? {
            scenario_id: selection.snapshot.selectedScenario.scenarioId,
            scenario_title: p03.selectedScenario.scenario_title,
            money_distance: selection.snapshot.selectedScenario.moneyDistance,
            proximity_rank: selection.snapshot.selectedScenario.proximityRank,
            proof_level: selection.snapshot.selectedScenario.proofLevel,
            capacity_fit: selection.snapshot.selectedScenario.capacityFit,
            model_fit: selection.snapshot.selectedScenario.modelFit,
            signal_speed_rank: selection.snapshot.selectedScenario.signalSpeedRank,
            complexity: selection.snapshot.selectedScenario.complexity,
            evidence_ids: structuredClone(selection.snapshot.selectedScenario.evidenceIds),
          }
        : null,
      p03OutcomeStatus: p03.result?.analysisStatus ?? "skipped_no_eligible_scenario",
      p03Result: structuredClone(p03.result),
      lockedTeaser: p03.lockedTeaser,
    },
    clientContext: structuredClone(source.clientContext),
  };

  const scores = currentScores(context);
  for (const elementId of SEVEN_K_ELEMENT_IDS) {
    if (
      target.currentScores[elementId] !== scores[elementId] ||
      target.target.targetScores[elementId] < scores[elementId]
    ) fail("P04_SCORE_CONFLICT", `${elementId} differs across P-01 and deterministic Target.`, "integrity");
  }
  validateP02Invariants(validateP02Schema(p02.result), {
    strategyContext: p02.strategyContext,
    targetConfig: p02.targetConfig,
    currentScores: scores,
  });
  if (stableJson(p02.targetConfig) !== stableJson(context.target)) fail("P04_TARGET_PROJECTION_CONFLICT", "P-02 target projection differs from Stage 4.", "integrity");
  validateResolvedPlan(context);
  const forbiddenKey = containsForbiddenProjectionKey(context);
  if (forbiddenKey) fail("P04_CONTEXT_FORBIDDEN_DATA", `P04_CONTEXT contains forbidden key ${forbiddenKey}.`, "integrity");

  const reportPolicy = buildP04ReportPolicy(context);
  const sourceRegistry = buildP04SourceRegistry(context);
  const contextHash = await sha256(context);
  const sourceRegistryHash = await sha256(sourceRegistry);
  const upstreamHashes = {
    p01ResultHash,
    targetArchetypeResultHash,
    p02ResultHash,
    resolvedTransitionPlanHash,
    moneyNowSelectionHash,
    p03ResultHash,
  };
  const deterministicInputHash = await sha256({
    upstreamIds: {
      p01: p01.id,
      target: target.id,
      p02: p02.id,
      resolvedPlan: resolved.id,
      moneyNow: selection.id,
      p03: p03.id,
    },
    upstreamHashes,
    contextHash,
    reportPolicy,
    sourceRegistryHash,
    reportGlossary: REPORT_GLOSSARY,
    stageVersion: P04_STAGE_VERSION,
    promptVersion: P04_PROMPT_VERSION,
    schemaVersion: P04_OUTPUT_SCHEMA_VERSION,
    ruleVersions: P04_RULE_VERSIONS,
  });
  return {
    p01AnalysisResultId: p01.id,
    targetArchetypeResultId: target.id,
    p02AnalysisResultId: p02.id,
    resolvedTransitionPlanId: resolved.id,
    moneyNowSelectionId: selection.id,
    p03PrescriptionResultId: p03.id,
    upstreamHashes,
    context,
    contextHash,
    reportPolicy,
    sourceRegistry,
    sourceRegistryHash,
    reportGlossary: structuredClone(REPORT_GLOSSARY) as unknown as Record<string, unknown>,
    ruleVersions: P04_RULE_VERSIONS,
    inputHash: deterministicInputHash,
    deterministicInputHash,
  };
}

export function getExpectedArchetypeName(context: P04Context): string {
  return BUSINESS_ARCHETYPE_BY_ID[context.archetype.finalArchetype].name;
}
