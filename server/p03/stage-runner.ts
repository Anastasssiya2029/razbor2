import { P03_PROMPT_VERSION } from "@/server/7k/prompts/p03.v1.5";
import { asP03Error, P03Error } from "./errors";
import { prepareP03Input, type P03PreparedInput } from "./projections";
import { createD1P03Repository } from "./repository";
import { P03RunExecutionError, runP03MoneyNowPrescription } from "./runner";
import type {
  P03Repository,
  P03StageExecutionResult,
  RunP03StageOptions,
  StoredP03Result,
} from "./stage-types";
import {
  P03_LOCKED_TEASER_VERSION,
  P03_OUTPUT_SCHEMA_VERSION,
  P03_STAGE_VERSION,
} from "./types";

async function persistOrLoad(
  repository: P03Repository,
  candidate: StoredP03Result,
): Promise<{ result: StoredP03Result; replay: boolean }> {
  if (await repository.createResult(candidate)) return { result: candidate, replay: false };
  const existing = await repository.loadResult(candidate.analysisRunId);
  if (!existing) {
    throw new P03Error("P03_PERSISTENCE_CONFLICT", "P-03 insert conflicted but no immutable record exists.", "technical");
  }
  if (existing.deterministicInputHash !== candidate.deterministicInputHash) {
    throw new P03Error("P03_VERSION_CONFLICT", "Persisted P-03 belongs to another upstream/version snapshot.", "version_conflict");
  }
  return { result: existing, replay: true };
}

function nextStep(analysisRunId: string): string {
  return `/api/analysis-runs/${analysisRunId}/p04`;
}

function publicTeaser(result: StoredP03Result): string | null {
  return result.skippedOutcome ? null : result.lockedTeaser;
}

function outcomeStatus(result: StoredP03Result): P03StageExecutionResult["outcomeStatus"] {
  if (result.failureCode) return "technical_failure";
  if (result.skippedOutcome) return "skipped_no_eligible_scenario";
  return result.result?.analysisStatus ?? "technical_failure";
}

function baseStored(
  source: { diagnosticId: string; analysisRunId: string },
  prepared: P03PreparedInput,
  id: string,
  startedAt: string,
  finishedAt: string,
): Omit<StoredP03Result,
  | "result"
  | "skippedOutcome"
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
    moneyNowSelectionId: prepared.moneyNowSelectionId,
    moneyNowSelectionHash: prepared.moneyNowSelectionHash,
    p01AnalysisResultId: prepared.p01AnalysisResultId,
    p01ResultHash: prepared.p01ResultHash,
    stageVersion: P03_STAGE_VERSION,
    promptVersion: P03_PROMPT_VERSION,
    outputSchemaVersion: P03_OUTPUT_SCHEMA_VERSION,
    ruleVersions: prepared.ruleVersions,
    contextHash: prepared.kind === "selected" ? prepared.contextHash : null,
    inputHash: prepared.inputHash,
    deterministicInputHash: prepared.deterministicInputHash,
    context: prepared.kind === "selected" ? prepared.context : null,
    selectedScenario: prepared.kind === "selected" ? prepared.selectedScenario : null,
    backendMetrics: prepared.backendMetrics,
    backendRevenueScenario: prepared.backendRevenueScenario,
    lockedTeaserVersion: P03_LOCKED_TEASER_VERSION,
    lockedTeaser: prepared.lockedTeaser,
    startedAt,
    finishedAt,
  };
}

export async function runP03Stage(
  analysisRunId: string,
  options: RunP03StageOptions = {},
): Promise<P03StageExecutionResult> {
  const repository = options.repository ?? createD1P03Repository();
  const source = await repository.loadSource(analysisRunId);
  if (!source) throw new P03Error("P03_ANALYSIS_RUN_NOT_FOUND", "Analysis run was not found.", "validation");
  if (!["money_now", "writing_report", "analysis_failed"].includes(source.runStatus)) {
    throw new P03Error("P03_NOT_READY", `Analysis run status=${source.runStatus}; expected money_now.`, "validation");
  }

  let prepared: P03PreparedInput;
  try {
    prepared = await prepareP03Input(source);
  } catch (unknownError) {
    const error = asP03Error(unknownError);
    if (error.kind !== "version_conflict") {
      await repository.updateRun(analysisRunId, {
        status: "analysis_failed",
        errorCode: error.code,
        errorMessage: error.message,
        promptVersion: P03_PROMPT_VERSION,
        metadata: { stageVersion: P03_STAGE_VERSION, preflightFailed: true, code: error.code },
      });
    }
    throw error;
  }

  const existing = await repository.loadResult(analysisRunId);
  if (existing) {
    if (existing.deterministicInputHash !== prepared.deterministicInputHash) {
      throw new P03Error("P03_VERSION_CONFLICT", "P-03 upstream or versioned resources changed after persistence.", "version_conflict");
    }
    const status = existing.failureCode ? "analysis_failed" : "writing_report";
    await repository.updateRun(analysisRunId, {
      status,
      errorCode: existing.failureCode,
      errorMessage: existing.failureMessage,
      promptVersion: P03_PROMPT_VERSION,
      metadata: {
        stageVersion: P03_STAGE_VERSION,
        inputHash: existing.inputHash,
        ruleVersions: existing.ruleVersions,
        outcomeStatus: outcomeStatus(existing),
        idempotentReplay: true,
      },
    });
    return {
      analysisRunId,
      status,
      idempotentReplay: true,
      nextStep: status === "writing_report" ? nextStep(analysisRunId) : null,
      publicTeaser: publicTeaser(existing),
      outcomeStatus: outcomeStatus(existing),
      result: existing,
    };
  }
  if (source.runStatus !== "money_now") {
    throw new P03Error("P03_RESULT_MISSING", `${source.runStatus} run has no persisted P-03 result.`, "validation");
  }

  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const started = now();
  if (prepared.kind === "skipped") {
    const finished = now();
    const candidate: StoredP03Result = {
      ...baseStored(source, prepared, createId(), started.toISOString(), finished.toISOString()),
      result: null,
      skippedOutcome: {
        status: "skipped_no_eligible_scenario",
        p03Result: null,
        moneyNowSelectionId: prepared.moneyNowSelectionId,
        reason: "no_eligible_scenario",
      },
      providerRawResponse: null,
      provider: null,
      model: null,
      latencyMs: Math.max(0, finished.getTime() - started.getTime()),
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      retryCount: 0,
      technicalRetryCount: 0,
      reevaluationRetryCount: 0,
      failureCode: null,
      failureMessage: null,
    };
    const persisted = await persistOrLoad(repository, candidate);
    await repository.updateRun(analysisRunId, {
      status: "writing_report",
      errorCode: null,
      errorMessage: null,
      promptVersion: P03_PROMPT_VERSION,
      metadata: {
        stageVersion: P03_STAGE_VERSION,
        inputHash: prepared.inputHash,
        ruleVersions: prepared.ruleVersions,
        outcomeStatus: "skipped_no_eligible_scenario",
        aiCalled: false,
        idempotentReplay: persisted.replay,
      },
    });
    return {
      analysisRunId,
      status: "writing_report",
      idempotentReplay: persisted.replay,
      nextStep: nextStep(analysisRunId),
      publicTeaser: null,
      outcomeStatus: "skipped_no_eligible_scenario",
      result: persisted.result,
    };
  }

  try {
    const outcome = await runP03MoneyNowPrescription(prepared, {
      provider: options.provider,
      now: options.now,
    });
    const candidate: StoredP03Result = {
      ...baseStored(source, prepared, createId(), outcome.metadata.startedAt, outcome.metadata.finishedAt),
      result: outcome.result,
      skippedOutcome: null,
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
    const persisted = await persistOrLoad(repository, candidate);
    await repository.updateRun(analysisRunId, {
      status: "writing_report",
      errorCode: null,
      errorMessage: null,
      promptVersion: P03_PROMPT_VERSION,
      metadata: {
        stageVersion: P03_STAGE_VERSION,
        inputHash: prepared.inputHash,
        contextHash: prepared.contextHash,
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
        outcomeStatus: persisted.result.result?.analysisStatus,
        p04Started: false,
        idempotentReplay: persisted.replay,
      },
    });
    return {
      analysisRunId,
      status: "writing_report",
      idempotentReplay: persisted.replay,
      nextStep: nextStep(analysisRunId),
      publicTeaser: publicTeaser(persisted.result),
      outcomeStatus: outcomeStatus(persisted.result),
      result: persisted.result,
    };
  } catch (unknownError) {
    if (!(unknownError instanceof P03RunExecutionError)) throw asP03Error(unknownError);
    const failed: StoredP03Result = {
      ...baseStored(
        source,
        prepared,
        createId(),
        unknownError.metadata.startedAt,
        unknownError.metadata.finishedAt,
      ),
      result: null,
      skippedOutcome: null,
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
    const persisted = await persistOrLoad(repository, failed);
    await repository.updateRun(analysisRunId, {
      status: "analysis_failed",
      errorCode: persisted.result.failureCode,
      errorMessage: persisted.result.failureMessage,
      promptVersion: P03_PROMPT_VERSION,
      metadata: {
        stageVersion: P03_STAGE_VERSION,
        inputHash: prepared.inputHash,
        contextHash: prepared.contextHash,
        ruleVersions: prepared.ruleVersions,
        retryCount: persisted.result.retryCount,
        outcomeStatus: "technical_failure",
        idempotentReplay: persisted.replay,
      },
    });
    return {
      analysisRunId,
      status: "analysis_failed",
      idempotentReplay: persisted.replay,
      nextStep: null,
      publicTeaser: null,
      outcomeStatus: "technical_failure",
      result: persisted.result,
    };
  }
}
