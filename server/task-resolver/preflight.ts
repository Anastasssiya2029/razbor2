import { TRANSITIONS_70, TRANSITIONS_RESOURCE_VERSION, validateTransitionRegistry } from "@/server/7k/transition-resolver";
import { SEVEN_K_ELEMENT_IDS, type SevenKScores } from "@/server/7k/types";
import { validateP02Invariants, validateP02Schema } from "@/server/p02/validation";
import type { TargetConfigProjection } from "@/server/p02/types";
import { sha256, stableJson } from "@/server/stage4/hash";
import { TaskResolverError } from "./errors";
import { TASK_RESOLVER_STAGE_VERSION, type PreparedTaskResolverInput, type TaskResolverSource } from "./types";

function containsLegacyProductId(value: unknown): boolean {
  if (value === "products_method") return true;
  if (Array.isArray(value)) return value.some(containsLegacyProductId);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => key === "products_method" || containsLegacyProductId(nested),
    );
  }
  return false;
}

function targetProjection(source: TaskResolverSource): TargetConfigProjection {
  const target = source.targetStage?.target;
  if (!target) {
    throw new TaskResolverError("TASK_RESOLVER_TARGET_MISSING", "Persisted Stage 4 Target Configuration is required.", "upstream_blocked");
  }
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

export async function taskResolverSnapshot(source: TaskResolverSource): Promise<{
  p02ResultHash: string | null;
  targetResultHash: string | null;
  deterministicInputHash: string;
}> {
  const p02ResultHash = source.p02?.result ? await sha256(source.p02.result) : null;
  const targetResultHash = source.targetStage?.target ? await sha256(source.targetStage.target) : null;
  const deterministicInputHash = await sha256({
    p02AnalysisResultId: source.p02?.id ?? null,
    p02ResultHash,
    targetArchetypeResultId: source.targetStage?.id ?? null,
    targetResultHash,
    transitionRegistryVersion: TRANSITIONS_RESOURCE_VERSION,
    stageVersion: TASK_RESOLVER_STAGE_VERSION,
  });
  return { p02ResultHash, targetResultHash, deterministicInputHash };
}

export async function prepareTaskResolverInput(source: TaskResolverSource): Promise<PreparedTaskResolverInput> {
  const p01 = source.p01;
  const stage4 = source.targetStage;
  const p02 = source.p02;
  if (!p02 || p02.failureCode || !p02.result) {
    throw new TaskResolverError("TASK_RESOLVER_P02_MISSING", p02?.failureMessage ?? "A successful persisted P-02 result is required.", "upstream_blocked");
  }
  if (p02.promptVersion !== "P-02.v1.3" || p02.outputSchemaVersion !== "1.3") {
    throw new TaskResolverError("TASK_RESOLVER_UNSUPPORTED_P02_VERSION", "Task Resolver supports only persisted P-02.v1.3/schema 1.3.", "upstream_blocked");
  }
  if (p02.result.analysisStatus === "blocked_by_inconsistency") {
    throw new TaskResolverError("TASK_RESOLVER_P02_BLOCKED", "Blocked P-02 cannot be resolved into tasks.", "upstream_blocked");
  }
  if (!(p02.result.analysisStatus === "ok" || p02.result.analysisStatus === "low_confidence")) {
    throw new TaskResolverError("TASK_RESOLVER_P02_STATUS_INVALID", `Unsupported P-02 status ${p02.result.analysisStatus}.`, "upstream_blocked");
  }
  if (p02.result.elementSequence.length < 1) {
    throw new TaskResolverError("TASK_RESOLVER_EMPTY_SEQUENCE", "P-02 elementSequence is empty.", "validation");
  }
  if (!stage4 || stage4.failureCode || !stage4.target || !stage4.currentScores) {
    throw new TaskResolverError("TASK_RESOLVER_TARGET_MISSING", stage4?.failureMessage ?? "Persisted Stage 4 Target Configuration is required.", "upstream_blocked");
  }
  if (!p01.id || !p01.result || p01.failureCode) {
    throw new TaskResolverError("TASK_RESOLVER_P01_MISSING", "Persisted validated P-01 is required for current score verification.", "upstream_blocked");
  }
  if (p01.promptVersion !== "P-01.v1.4.1" || p01.outputSchemaVersion !== "1.4") {
    throw new TaskResolverError("TASK_RESOLVER_UNSUPPORTED_P01_VERSION", "Task Resolver requires P-01.v1.4.1/schema 1.4.", "upstream_blocked");
  }
  if (stage4.resourceVersions.targetRules !== "target-rules.v2.1" || stage4.target.resourceVersion !== "target-rules.v2.1") {
    throw new TaskResolverError("TASK_RESOLVER_UNSUPPORTED_TARGET_VERSION", "Task Resolver requires target-rules.v2.1.", "upstream_blocked");
  }
  if (TRANSITIONS_RESOURCE_VERSION !== "transitions-70.v1") {
    throw new TaskResolverError("TASK_RESOLVER_REGISTRY_VERSION_MISMATCH", "Task Resolver requires transitions-70.v1.", "integrity");
  }
  try {
    validateTransitionRegistry(TRANSITIONS_70);
  } catch (error) {
    throw new TaskResolverError(
      "TASK_RESOLVER_REGISTRY_INTEGRITY_FAILED",
      error instanceof Error ? error.message : "transitions-70.v1 failed integrity validation.",
      "integrity",
    );
  }
  if (containsLegacyProductId(p02.result) || containsLegacyProductId(p02.strategyContext) || containsLegacyProductId(p02.targetConfig)) {
    throw new TaskResolverError("TASK_RESOLVER_LEGACY_ELEMENT_ID", "products_method is forbidden; use product_method only.", "validation");
  }
  if (
    p02.p01AnalysisResultId !== p01.id ||
    stage4.p01AnalysisResultId !== p01.id ||
    p02.targetArchetypeResultId !== stage4.id
  ) {
    throw new TaskResolverError("TASK_RESOLVER_UPSTREAM_SNAPSHOT_CONFLICT", "P-01, Stage 4 and P-02 persisted IDs are not linked to the same run snapshot.", "validation");
  }
  const p01ResultHash = await sha256(p01.result);
  const targetResultHash = await sha256(stage4.target);
  if (p02.p01ResultHash !== p01ResultHash || stage4.p01ResultHash !== p01ResultHash) {
    throw new TaskResolverError("TASK_RESOLVER_UPSTREAM_SNAPSHOT_CONFLICT", "P-01 result hashes do not match persisted Stage 4/P-02 snapshots.", "validation");
  }
  if (p02.targetResultHash !== targetResultHash) {
    throw new TaskResolverError("TASK_RESOLVER_UPSTREAM_SNAPSHOT_CONFLICT", "Stage 4 target hash differs from the P-02 persisted target snapshot.", "validation");
  }
  const currentScores = Object.fromEntries(
    SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, p01.result!.current7k[elementId].score]),
  ) as SevenKScores;
  for (const elementId of SEVEN_K_ELEMENT_IDS) {
    if (!Number.isInteger(currentScores[elementId]) || currentScores[elementId] !== stage4.currentScores[elementId]) {
      throw new TaskResolverError("TASK_RESOLVER_CURRENT_SCORE_CONFLICT", `${elementId} current score differs between P-01 and Stage 4.`, "validation");
    }
  }
  const expectedStrategyContext = {
    evidenceLedger: p01.result.evidenceLedger,
    current7k: p01.result.current7k,
    businessMap: p01.result.businessMap,
    moneyChainFacts: p01.result.moneyChainFacts,
    desiredRoleSummary: p01.result.targetIntent.desiredRoleSummary,
    desiredSystemWeeklyHours: p01.result.targetIntent.desiredSystemWeeklyHours,
  };
  const expectedTargetProjection = targetProjection(source);
  if (stableJson(p02.strategyContext) !== stableJson(expectedStrategyContext)) {
    throw new TaskResolverError("TASK_RESOLVER_UPSTREAM_SNAPSHOT_CONFLICT", "P-02 P-01 projection differs from the persisted P-01 result.", "validation");
  }
  if (stableJson(p02.targetConfig) !== stableJson(expectedTargetProjection)) {
    throw new TaskResolverError("TASK_RESOLVER_UPSTREAM_SNAPSHOT_CONFLICT", "P-02 target projection differs from persisted Stage 4.", "validation");
  }
  try {
    validateP02Invariants(validateP02Schema(p02.result), {
      strategyContext: p02.strategyContext,
      targetConfig: p02.targetConfig,
      currentScores,
    });
  } catch (error) {
    throw new TaskResolverError(
      "TASK_RESOLVER_P02_INVALID",
      error instanceof Error ? error.message : "Persisted P-02 is invalid.",
      "validation",
    );
  }
  const snapshot = await taskResolverSnapshot(source);
  return {
    planInput: {
      elementSequence: p02.result.elementSequence,
      businessValidation: p02.result.businessValidation,
      currentScores,
      targetScores: stage4.target.targetScores,
    },
    p01AnalysisResultId: p01.id,
    targetArchetypeResultId: stage4.id,
    p02AnalysisResultId: p02.id,
    p02ResultHash: snapshot.p02ResultHash!,
    targetResultHash: snapshot.targetResultHash!,
    deterministicInputHash: snapshot.deterministicInputHash,
  };
}
