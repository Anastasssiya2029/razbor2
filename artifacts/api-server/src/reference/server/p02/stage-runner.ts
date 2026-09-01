import { sha256 } from "@/server/stage4/hash";
import { withCallLogging } from "@/server/ai/call-log";
import { asP02Error, P02Error } from "./errors";
import { P02_RULE_VERSIONS, prepareP02Input } from "./projections";
import { createD1P02Repository } from "./repository";
import { createConfiguredP02Provider } from "./provider";
import { hashP02Input, P02RunExecutionError, runP02TransitionStrategist } from "./runner";
import type { P02Repository, P02StageExecutionResult, RunP02StageOptions, StoredP02Result } from "./stage-types";
import type { P02RunMetadata } from "./types";

async function persistOrLoad(repository: P02Repository, candidate: StoredP02Result): Promise<{ result: StoredP02Result; replay: boolean }> {
  if (await repository.createResult(candidate)) return { result: candidate, replay: false };
  const existing = await repository.loadResult(candidate.analysisRunId);
  if (!existing) throw new P02Error("P02_PERSISTENCE_CONFLICT", "P-02 insert conflicted but no stored record exists.", "technical");
  if (existing.inputHash !== candidate.inputHash) throw new P02Error("P02_VERSION_CONFLICT", "Stored P-02 belongs to a different upstream/version snapshot.", "version_conflict");
  return { result: existing, replay: true };
}

function storedFromMetadata(options: {
  id: string;
  diagnosticId: string;
  analysisRunId: string;
  p01AnalysisResultId: string;
  targetArchetypeResultId: string;
  p01ResultHash: string;
  targetResultHash: string;
  strategyContext: StoredP02Result["strategyContext"];
  targetConfig: StoredP02Result["targetConfig"];
  metadata: P02RunMetadata;
  result: StoredP02Result["result"];
  providerRawResponse: unknown;
  failureCode: string | null;
  failureMessage: string | null;
}): StoredP02Result {
  return {
    id: options.id,
    diagnosticId: options.diagnosticId,
    analysisRunId: options.analysisRunId,
    p01AnalysisResultId: options.p01AnalysisResultId,
    targetArchetypeResultId: options.targetArchetypeResultId,
    p01ResultHash: options.p01ResultHash,
    targetResultHash: options.targetResultHash,
    promptVersion: options.metadata.promptVersion,
    outputSchemaVersion: options.metadata.outputSchemaVersion,
    ruleVersions: options.metadata.ruleVersions,
    inputHash: options.metadata.inputHash,
    strategyContext: options.strategyContext,
    targetConfig: options.targetConfig,
    result: options.result,
    providerRawResponse: options.providerRawResponse,
    provider: options.metadata.provider,
    model: options.metadata.model,
    startedAt: options.metadata.startedAt,
    finishedAt: options.metadata.finishedAt,
    latencyMs: options.metadata.latencyMs,
    inputTokens: options.metadata.usage.inputTokens,
    outputTokens: options.metadata.usage.outputTokens,
    totalTokens: options.metadata.usage.totalTokens,
    costUsd: options.metadata.usage.costUsd,
    retryCount: options.metadata.retryCount,
    technicalRetryCount: options.metadata.technicalRetryCount,
    reevaluationRetryCount: options.metadata.reevaluationRetryCount,
    failureCode: options.failureCode,
    failureMessage: options.failureMessage,
  };
}

export async function runP02Stage(
  analysisRunId: string,
  options: RunP02StageOptions = {},
): Promise<P02StageExecutionResult> {
  const repository = options.repository ?? createD1P02Repository();
  const source = await repository.loadSource(analysisRunId);
  if (!source) throw new P02Error("P02_ANALYSIS_RUN_NOT_FOUND", "Analysis run was not found.", "validation");
  if (!["strategizing", "resolving_tasks", "analysis_failed"].includes(source.runStatus)) {
    throw new P02Error("P02_NOT_READY", `Analysis run status=${source.runStatus}; expected strategizing.`, "validation");
  }

  let prepared;
  try {
    prepared = prepareP02Input(source);
  } catch (error) {
    const failure = asP02Error(error);
    if (failure.kind !== "version_conflict") {
      await repository.updateRun(analysisRunId, {
        status: "analysis_failed",
        errorCode: failure.code,
        errorMessage: failure.message,
        promptVersion: "P-02.v1.3",
        metadata: { stageVersion: "p02-transition-strategist-stage.v1", preflightFailed: true, code: failure.code },
      });
    }
    throw failure;
  }
  const stage4 = source.targetStage!;
  const p01ResultHash = await sha256(source.p01Result);
  const targetResultHash = await sha256(stage4.target);
  const inputHash = await hashP02Input({ strategyContext: prepared.strategyContext, targetConfig: prepared.targetConfig, ruleVersions: prepared.ruleVersions });
  const existing = await repository.loadResult(analysisRunId);
  if (existing) {
    if (existing.inputHash !== inputHash || existing.p01ResultHash !== p01ResultHash || existing.targetResultHash !== targetResultHash) {
      throw new P02Error("P02_VERSION_CONFLICT", "P-02 already exists for a different upstream/version snapshot.", "version_conflict");
    }
    if (!existing.failureCode || !options.retryFailed) {
      const status = existing.failureCode ? "analysis_failed" : "resolving_tasks";
      await repository.updateRun(analysisRunId, {
        status,
        errorCode: existing.failureCode,
        errorMessage: existing.failureMessage,
        promptVersion: existing.promptVersion,
        metadata: { stageVersion: "p02-transition-strategist-stage.v1", inputHash, ruleVersions: existing.ruleVersions, idempotentReplay: true },
      });
      return { analysisRunId, status, idempotentReplay: true, result: existing };
    }
    if (!repository.replaceFailedResult) {
      throw new P02Error("P02_RETRY_UNSUPPORTED", "Repository cannot replace a failed P-02 attempt.", "technical");
    }
  }
  if (source.runStatus !== "strategizing" && !(source.runStatus === "analysis_failed" && existing?.failureCode && options.retryFailed)) {
    throw new P02Error("P02_RESULT_MISSING", "Run is not ready for a new P-02 attempt.", "validation");
  }

  const persistCandidate = async (candidate: StoredP02Result) => {
    if (existing?.failureCode && options.retryFailed) {
      if (!await repository.replaceFailedResult!(candidate)) {
        throw new P02Error("P02_PERSISTENCE_CONFLICT", "Failed P-02 attempt changed before retry could be saved.", "technical");
      }
      return { result: { ...candidate, id: existing.id }, replay: false };
    }
    return persistOrLoad(repository, candidate);
  };

  const createId = options.createId ?? (() => crypto.randomUUID());
  try {
    const provider = options.provider
      ?? withCallLogging(createConfiguredP02Provider(process.env as Record<string, string | undefined>), {
        module: "p02",
        analysisRunId,
      });
    const outcome = await runP02TransitionStrategist(prepared, { provider, now: options.now, inputHash });
    const failureCode = outcome.kind === "blocked" ? outcome.failureCode : null;
    const failureMessage = outcome.kind === "blocked" ? outcome.failureMessage : null;
    const candidate = storedFromMetadata({
      id: createId(),
      diagnosticId: source.diagnosticId,
      analysisRunId,
      p01AnalysisResultId: source.p01AnalysisResultId!,
      targetArchetypeResultId: stage4.id,
      p01ResultHash,
      targetResultHash,
      strategyContext: prepared.strategyContext,
      targetConfig: prepared.targetConfig,
      metadata: outcome.metadata,
      result: outcome.result,
      providerRawResponse: outcome.providerRawResponse,
      failureCode,
      failureMessage,
    });
    const persisted = await persistCandidate(candidate);
    const status = persisted.result.failureCode ? "analysis_failed" : "resolving_tasks";
    await repository.updateRun(analysisRunId, {
      status,
      errorCode: persisted.result.failureCode,
      errorMessage: persisted.result.failureMessage,
      promptVersion: persisted.result.promptVersion,
      metadata: {
        stageVersion: "p02-transition-strategist-stage.v1",
        inputHash,
        ruleVersions: prepared.ruleVersions,
        provider: persisted.result.provider,
        model: persisted.result.model,
        latencyMs: persisted.result.latencyMs,
        retryCount: persisted.result.retryCount,
        usage: { inputTokens: persisted.result.inputTokens, outputTokens: persisted.result.outputTokens, totalTokens: persisted.result.totalTokens, costUsd: persisted.result.costUsd },
        idempotentReplay: persisted.replay,
        retriedFailedResultId: existing?.failureCode && options.retryFailed ? existing.id : null,
        previousFailureCode: existing?.failureCode && options.retryFailed ? existing.failureCode : null,
      },
    });
    return { analysisRunId, status, idempotentReplay: persisted.replay, result: persisted.result };
  } catch (unknownError) {
    if (!(unknownError instanceof P02RunExecutionError)) throw asP02Error(unknownError);
    const failed = storedFromMetadata({
      id: createId(),
      diagnosticId: source.diagnosticId,
      analysisRunId,
      p01AnalysisResultId: source.p01AnalysisResultId!,
      targetArchetypeResultId: stage4.id,
      p01ResultHash,
      targetResultHash,
      strategyContext: prepared.strategyContext,
      targetConfig: prepared.targetConfig,
      metadata: unknownError.metadata,
      result: null,
      providerRawResponse: unknownError.providerRawResponse,
      failureCode: unknownError.failureCode,
      failureMessage: unknownError.message,
    });
    const persisted = await persistCandidate(failed);
    await repository.updateRun(analysisRunId, {
      status: "analysis_failed",
      errorCode: persisted.result.failureCode,
      errorMessage: persisted.result.failureMessage,
      promptVersion: persisted.result.promptVersion,
      metadata: {
        stageVersion: "p02-transition-strategist-stage.v1",
        inputHash,
        ruleVersions: P02_RULE_VERSIONS,
        retryCount: persisted.result.retryCount,
        idempotentReplay: persisted.replay,
        retriedFailedResultId: existing?.failureCode && options.retryFailed ? existing.id : null,
        previousFailureCode: existing?.failureCode && options.retryFailed ? existing.failureCode : null,
      },
    });
    return { analysisRunId, status: "analysis_failed", idempotentReplay: persisted.replay, result: persisted.result };
  }
}
