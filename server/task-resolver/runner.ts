import { TRANSITIONS_RESOURCE_VERSION } from "@/server/7k/transition-resolver";
import { createD1TaskResolverRepository } from "./repository";
import { asTaskResolverError, TaskResolverError } from "./errors";
import { prepareTaskResolverInput, taskResolverSnapshot } from "./preflight";
import { buildResolvedTransitionPlan } from "./resolve-plan";
import {
  TASK_RESOLVER_STAGE_VERSION,
  type StoredResolvedTransitionPlan,
  type TaskResolverExecutionResult,
  type TaskResolverRepository,
} from "./types";

export type RunTaskResolverStageOptions = {
  repository?: TaskResolverRepository;
  now?: () => Date;
  createId?: () => string;
  resolvePlan?: typeof buildResolvedTransitionPlan;
};

async function persistOrLoad(
  repository: TaskResolverRepository,
  candidate: StoredResolvedTransitionPlan,
): Promise<{ result: StoredResolvedTransitionPlan; replay: boolean }> {
  if (await repository.createResult(candidate)) return { result: candidate, replay: false };
  const existing = await repository.loadResult(candidate.analysisRunId);
  if (!existing) {
    throw new TaskResolverError("TASK_RESOLVER_PERSISTENCE_CONFLICT", "Result was not inserted and no existing snapshot was found.", "technical");
  }
  if (existing.deterministicInputHash !== candidate.deterministicInputHash) {
    throw new TaskResolverError("TASK_RESOLVER_VERSION_CONFLICT", "An immutable Task Resolver result already exists for a different upstream/version snapshot.", "version_conflict");
  }
  return { result: existing, replay: true };
}

export async function runTaskResolverStage(
  analysisRunId: string,
  options: RunTaskResolverStageOptions = {},
): Promise<TaskResolverExecutionResult> {
  const repository = options.repository ?? createD1TaskResolverRepository();
  const source = await repository.loadSource(analysisRunId);
  if (!source) {
    throw new TaskResolverError("TASK_RESOLVER_ANALYSIS_RUN_NOT_FOUND", "Analysis run was not found.", "validation");
  }
  const snapshot = await taskResolverSnapshot(source);
  const existing = await repository.loadResult(analysisRunId);
  if (existing) {
    if (existing.deterministicInputHash !== snapshot.deterministicInputHash) {
      throw new TaskResolverError("TASK_RESOLVER_VERSION_CONFLICT", "Upstream P-02, Target Configuration or resolver resource version changed after persistence.", "version_conflict");
    }
    const status = existing.failureCode ? "analysis_failed" : "money_now";
    await repository.updateRun(analysisRunId, {
      status,
      errorCode: existing.failureCode,
      errorMessage: existing.failureMessage,
      metadata: {
        stageVersion: existing.stageVersion,
        transitionRegistryVersion: existing.transitionRegistryVersion,
        deterministicInputHash: existing.deterministicInputHash,
        totalTasks: existing.plan?.totalTasks ?? null,
        idempotentReplay: true,
      },
    });
    return { analysisRunId, status, idempotentReplay: true, result: existing };
  }
  if (source.runStatus !== "resolving_tasks") {
    throw new TaskResolverError("TASK_RESOLVER_NOT_READY", `Analysis run status=${source.runStatus}; expected resolving_tasks.`, "validation");
  }
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const createId = options.createId ?? (() => crypto.randomUUID());
  try {
    const prepared = await prepareTaskResolverInput(source);
    const plan = (options.resolvePlan ?? buildResolvedTransitionPlan)(prepared.planInput);
    const completedAt = now().toISOString();
    const persisted = await persistOrLoad(repository, {
      id: createId(),
      diagnosticId: source.diagnosticId,
      analysisRunId,
      p01AnalysisResultId: prepared.p01AnalysisResultId,
      targetArchetypeResultId: prepared.targetArchetypeResultId,
      p02AnalysisResultId: prepared.p02AnalysisResultId,
      p02ResultHash: prepared.p02ResultHash,
      targetResultHash: prepared.targetResultHash,
      stageVersion: TASK_RESOLVER_STAGE_VERSION,
      transitionRegistryVersion: TRANSITIONS_RESOURCE_VERSION,
      deterministicInputHash: prepared.deterministicInputHash,
      plan,
      startedAt,
      completedAt,
      failureCode: null,
      failureMessage: null,
    });
    if (persisted.result.failureCode) {
      throw new TaskResolverError("TASK_RESOLVER_PERSISTED_FAILURE_CONFLICT", "A failed immutable Task Resolver snapshot already exists for this input.", "version_conflict");
    }
    await repository.updateRun(analysisRunId, {
      status: "money_now",
      errorCode: null,
      errorMessage: null,
      metadata: {
        stageVersion: TASK_RESOLVER_STAGE_VERSION,
        transitionRegistryVersion: TRANSITIONS_RESOURCE_VERSION,
        deterministicInputHash: prepared.deterministicInputHash,
        p02ResultHash: prepared.p02ResultHash,
        targetResultHash: prepared.targetResultHash,
        totalTasks: persisted.result.plan!.totalTasks,
        startedAt,
        completedAt,
        idempotentReplay: persisted.replay,
      },
    });
    return { analysisRunId, status: "money_now", idempotentReplay: persisted.replay, result: persisted.result };
  } catch (unknownError) {
    const error = asTaskResolverError(unknownError);
    if (error.kind === "version_conflict") throw error;
    const completedAt = now().toISOString();
    const failed = await persistOrLoad(repository, {
      id: createId(),
      diagnosticId: source.diagnosticId,
      analysisRunId,
      p01AnalysisResultId: source.p01.id,
      targetArchetypeResultId: source.targetStage?.id ?? null,
      p02AnalysisResultId: source.p02?.id ?? null,
      p02ResultHash: snapshot.p02ResultHash,
      targetResultHash: snapshot.targetResultHash,
      stageVersion: TASK_RESOLVER_STAGE_VERSION,
      transitionRegistryVersion: TRANSITIONS_RESOURCE_VERSION,
      deterministicInputHash: snapshot.deterministicInputHash,
      plan: null,
      startedAt,
      completedAt,
      failureCode: error.code,
      failureMessage: error.message,
    });
    await repository.updateRun(analysisRunId, {
      status: "analysis_failed",
      errorCode: failed.result.failureCode,
      errorMessage: failed.result.failureMessage,
      metadata: {
        stageVersion: TASK_RESOLVER_STAGE_VERSION,
        transitionRegistryVersion: TRANSITIONS_RESOURCE_VERSION,
        deterministicInputHash: snapshot.deterministicInputHash,
        failureKind: error.kind,
        idempotentReplay: failed.replay,
        startedAt,
        completedAt,
      },
    });
    return { analysisRunId, status: "analysis_failed", idempotentReplay: failed.replay, result: failed.result };
  }
}
