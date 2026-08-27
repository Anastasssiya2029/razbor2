import { P04_PROMPT_SHA256, P04_PROMPT_VERSION } from "@/server/7k/prompts/p04.v1.2";
import { asP04Error, P04Error } from "./errors";
import { prepareP04Input } from "./projections";
import { createD1P04Repository } from "./repository";
import { P04RunExecutionError, runP04ReportWriter } from "./runner";
import type {
  P04Repository,
  P04StageExecutionResult,
  RunP04StageOptions,
  StoredP04Result,
  P04PreparedInput,
} from "./stage-types";
import { P04_OUTPUT_SCHEMA_VERSION, P04_STAGE_VERSION } from "./types";

async function persistOrLoad(
  repository: P04Repository,
  candidate: StoredP04Result,
): Promise<{ result: StoredP04Result; replay: boolean }> {
  if (await repository.createResult(candidate)) return { result: candidate, replay: false };
  const existing = await repository.loadResult(candidate.analysisRunId);
  if (!existing) {
    throw new P04Error(
      "P04_PERSISTENCE_CONFLICT",
      "P-04 insert conflicted but no immutable record exists.",
      "technical",
    );
  }
  if (existing.deterministicInputHash !== candidate.deterministicInputHash) {
    throw new P04Error(
      "P04_VERSION_CONFLICT",
      "Persisted P-04 belongs to another upstream/version snapshot.",
      "version_conflict",
    );
  }
  return { result: existing, replay: true };
}

function baseStored(
  source: { diagnosticId: string; analysisRunId: string },
  prepared: P04PreparedInput,
  id: string,
  startedAt: string,
  finishedAt: string,
): Omit<
  StoredP04Result,
  | "result"
  | "providerRawResponse"
  | "provider"
  | "model"
  | "latencyMs"
  | "inputTokens"
  | "outputTokens"
  | "totalTokens"
  | "costUsd"
  | "retryCount"
  | "technicalRetryCount"
  | "reevaluationRetryCount"
  | "failureCode"
  | "failureMessage"
> {
  return {
    id,
    diagnosticId: source.diagnosticId,
    analysisRunId: source.analysisRunId,
    p01AnalysisResultId: prepared.p01AnalysisResultId,
    targetArchetypeResultId: prepared.targetArchetypeResultId,
    p02AnalysisResultId: prepared.p02AnalysisResultId,
    resolvedTransitionPlanId: prepared.resolvedTransitionPlanId,
    moneyNowSelectionId: prepared.moneyNowSelectionId,
    p03PrescriptionResultId: prepared.p03PrescriptionResultId,
    upstreamHashes: prepared.upstreamHashes,
    stageVersion: P04_STAGE_VERSION,
    promptVersion: P04_PROMPT_VERSION,
    outputSchemaVersion: P04_OUTPUT_SCHEMA_VERSION,
    promptSha256: P04_PROMPT_SHA256,
    ruleVersions: prepared.ruleVersions,
    context: prepared.context,
    contextHash: prepared.contextHash,
    reportPolicy: prepared.reportPolicy,
    sourceRegistry: prepared.sourceRegistry,
    sourceRegistryHash: prepared.sourceRegistryHash,
    reportGlossary: prepared.reportGlossary,
    inputHash: prepared.inputHash,
    deterministicInputHash: prepared.deterministicInputHash,
    startedAt,
    finishedAt,
  };
}

export async function runP04Stage(
  analysisRunId: string,
  options: RunP04StageOptions = {},
): Promise<P04StageExecutionResult> {
  const repository = options.repository ?? createD1P04Repository();
  const source = await repository.loadSource(analysisRunId);
  if (!source) {
    throw new P04Error("P04_ANALYSIS_RUN_NOT_FOUND", "Analysis run was not found.", "validation");
  }
  if (!["writing_report", "ready", "analysis_failed"].includes(source.runStatus)) {
    throw new P04Error(
      "P04_NOT_READY",
      `Analysis run status=${source.runStatus}; expected writing_report.`,
      "validation",
    );
  }

  let prepared: P04PreparedInput;
  try {
    prepared = await prepareP04Input(source);
  } catch (unknownError) {
    const error = asP04Error(unknownError);
    await repository.updateRun(analysisRunId, {
      status: "analysis_failed",
      errorCode: error.code,
      errorMessage: error.message,
      promptVersion: P04_PROMPT_VERSION,
      metadata: {
        stageVersion: P04_STAGE_VERSION,
        preflightFailed: true,
        code: error.code,
      },
    });
    throw error;
  }

  const existing = await repository.loadResult(analysisRunId);
  if (existing) {
    if (
      existing.deterministicInputHash !== prepared.deterministicInputHash ||
      existing.promptVersion !== P04_PROMPT_VERSION ||
      existing.outputSchemaVersion !== P04_OUTPUT_SCHEMA_VERSION ||
      existing.promptSha256 !== P04_PROMPT_SHA256
    ) {
      throw new P04Error(
        "P04_VERSION_CONFLICT",
        "Persisted P-04 upstream or versioned resources changed after persistence.",
        "version_conflict",
      );
    }
    if (options.retryFailed && existing.failureCode) {
      // Keep all deterministic upstream stages and rerun only the failed final
      // writer. The failed row is replaced atomically after the new attempt.
    } else {
    const status = existing.failureCode ? "analysis_failed" : "ready";
    await repository.updateRun(analysisRunId, {
      status,
      errorCode: existing.failureCode,
      errorMessage: existing.failureMessage,
      promptVersion: P04_PROMPT_VERSION,
      metadata: {
        stageVersion: P04_STAGE_VERSION,
        inputHash: existing.inputHash,
        contextHash: existing.contextHash,
        sourceRegistryHash: existing.sourceRegistryHash,
        ruleVersions: existing.ruleVersions,
        reportStoredServerSide: existing.result !== null,
        idempotentReplay: true,
      },
    });
    return {
      analysisRunId,
      status,
      idempotentReplay: true,
      nextStep: null,
      reportStoredServerSide: existing.result !== null,
    };
    }
  }
  if (source.runStatus !== "writing_report" && !(options.retryFailed && source.runStatus === "analysis_failed")) {
    throw new P04Error(
      "P04_RESULT_MISSING",
      `${source.runStatus} run has no persisted P-04 result.`,
      "validation",
    );
  }

  const createId = options.createId ?? (() => crypto.randomUUID());
  try {
    const outcome = await runP04ReportWriter(prepared, {
      provider: options.provider,
      now: options.now,
      moneyNowEnabled: options.moneyNowEnabled ?? true,
    });
    const candidate: StoredP04Result = {
      ...baseStored(
        source,
        prepared,
        createId(),
        outcome.metadata.startedAt,
        outcome.metadata.finishedAt,
      ),
      result: outcome.result,
      providerRawResponse: outcome.providerRawResponse,
      provider: outcome.metadata.provider,
      model: outcome.metadata.model,
      latencyMs: outcome.metadata.latencyMs,
      inputTokens: outcome.metadata.usage.inputTokens,
      outputTokens: outcome.metadata.usage.outputTokens,
      totalTokens: outcome.metadata.usage.totalTokens,
      costUsd: outcome.metadata.usage.costUsd,
      retryCount: outcome.metadata.retryCount,
      technicalRetryCount: outcome.metadata.technicalRetryCount,
      reevaluationRetryCount: outcome.metadata.reevaluationRetryCount,
      failureCode: null,
      failureMessage: null,
    };
    const retryReplacement = options.retryFailed && Boolean(existing?.failureCode);
    const replaced = retryReplacement ? await repository.replaceFailedResult(candidate) : false;
    const persisted = replaced
      ? { result: candidate, replay: false }
      : await persistOrLoad(repository, candidate);
    await repository.updateRun(analysisRunId, {
      status: "ready",
      errorCode: null,
      errorMessage: null,
      promptVersion: P04_PROMPT_VERSION,
      metadata: {
        stageVersion: P04_STAGE_VERSION,
        inputHash: prepared.inputHash,
        contextHash: prepared.contextHash,
        sourceRegistryHash: prepared.sourceRegistryHash,
        ruleVersions: prepared.ruleVersions,
        provider: persisted.result.provider,
        model: persisted.result.model,
        latencyMs: persisted.result.latencyMs,
        retryCount: persisted.result.retryCount,
        usage: {
          inputTokens: persisted.result.inputTokens,
          outputTokens: persisted.result.outputTokens,
          totalTokens: persisted.result.totalTokens,
          costUsd: persisted.result.costUsd,
        },
        reportStoredServerSide: true,
        finalAnalysisResultBuilt: false,
        p03AttachedToPublicReport: false,
        idempotentReplay: persisted.replay,
      },
    });
    return {
      analysisRunId,
      status: "ready",
      idempotentReplay: persisted.replay,
      nextStep: null,
      reportStoredServerSide: true,
    };
  } catch (unknownError) {
    if (!(unknownError instanceof P04RunExecutionError)) throw asP04Error(unknownError);
    const failed: StoredP04Result = {
      ...baseStored(
        source,
        prepared,
        createId(),
        unknownError.metadata.startedAt,
        unknownError.metadata.finishedAt,
      ),
      result: null,
      providerRawResponse: unknownError.providerRawResponse,
      provider: unknownError.metadata.provider,
      model: unknownError.metadata.model,
      latencyMs: unknownError.metadata.latencyMs,
      inputTokens: unknownError.metadata.usage.inputTokens,
      outputTokens: unknownError.metadata.usage.outputTokens,
      totalTokens: unknownError.metadata.usage.totalTokens,
      costUsd: unknownError.metadata.usage.costUsd,
      retryCount: unknownError.metadata.retryCount,
      technicalRetryCount: unknownError.metadata.technicalRetryCount,
      reevaluationRetryCount: unknownError.metadata.reevaluationRetryCount,
      failureCode: unknownError.failureCode,
      failureMessage: unknownError.message,
    };
    const retryReplacement = options.retryFailed && Boolean(existing?.failureCode);
    const replaced = retryReplacement ? await repository.replaceFailedResult(failed) : false;
    const persisted = replaced
      ? { result: failed, replay: false }
      : await persistOrLoad(repository, failed);
    await repository.updateRun(analysisRunId, {
      status: "analysis_failed",
      errorCode: persisted.result.failureCode,
      errorMessage: persisted.result.failureMessage,
      promptVersion: P04_PROMPT_VERSION,
      metadata: {
        stageVersion: P04_STAGE_VERSION,
        inputHash: prepared.inputHash,
        contextHash: prepared.contextHash,
        sourceRegistryHash: prepared.sourceRegistryHash,
        ruleVersions: prepared.ruleVersions,
        retryCount: persisted.result.retryCount,
        reportStoredServerSide: false,
        idempotentReplay: persisted.replay,
      },
    });
    return {
      analysisRunId,
      status: "analysis_failed",
      idempotentReplay: persisted.replay,
      nextStep: null,
      reportStoredServerSide: false,
    };
  }
}
