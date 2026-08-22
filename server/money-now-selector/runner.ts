import {
  selectMoneyNowCandidate,
  type MoneyNowSelectionDecision,
} from "@/server/7k/money-now-selector";
import { MONEY_NOW_SELECTOR_CONTRACT_VERSION } from "@/server/7k/config/money-now-selector-contract.v1";
import { MONEY_NOW_FACT_EXTRACTION_VERSION } from "@/server/7k/config/money-now-fact-extraction.v1";
import { MONEY_NOW_RESOURCE_VERSION } from "@/server/7k/config/money-now.v2.2";
import { sha256 } from "@/server/stage4/hash";
import { asMoneyNowSelectorStageError, MoneyNowSelectorStageError } from "./errors";
import {
  moneyNowSelectorSourceSnapshot,
  prepareMoneyNowSelectorInput,
} from "./preflight";
import { createD1MoneyNowSelectorRepository } from "./repository";
import {
  MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256,
  MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256,
  MONEY_NOW_SELECTOR_STAGE_VERSION,
  type MoneyNowSelectionSnapshot,
  type MoneyNowSelectorExecutionResult,
  type MoneyNowSelectorRepository,
  type StoredMoneyNowSelection,
} from "./types";

export type RunMoneyNowSelectorStageOptions = {
  repository?: MoneyNowSelectorRepository;
  now?: () => Date;
  createId?: () => string;
  selector?: typeof selectMoneyNowCandidate;
};

function nextStep(
  analysisRunId: string,
  snapshot: MoneyNowSelectionSnapshot | null,
): string | null {
  return snapshot
    ? `/api/analysis-runs/${analysisRunId}/p03`
    : null;
}

async function persistOrLoad(
  repository: MoneyNowSelectorRepository,
  candidate: StoredMoneyNowSelection,
): Promise<{ result: StoredMoneyNowSelection; replay: boolean }> {
  if (await repository.createResult(candidate)) return { result: candidate, replay: false };
  const existing = await repository.loadResult(candidate.analysisRunId);
  if (!existing) {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_PERSISTENCE_CONFLICT",
      "Selection was not inserted and no immutable snapshot was found.",
      "technical",
    );
  }
  if (existing.deterministicInputHash !== candidate.deterministicInputHash) {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_VERSION_CONFLICT",
      "An immutable Money Now selection exists for a different P-01/version snapshot.",
      "version_conflict",
    );
  }
  return { result: existing, replay: true };
}

function resourceFields() {
  return {
    stageVersion: MONEY_NOW_SELECTOR_STAGE_VERSION,
    selectorContractVersion: MONEY_NOW_SELECTOR_CONTRACT_VERSION,
    selectorContractJsonSha256: MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256,
    selectorContractTsSha256: MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256,
    businessMethodologyVersion: MONEY_NOW_RESOURCE_VERSION,
    factExtractionVersion: MONEY_NOW_FACT_EXTRACTION_VERSION,
  } as const;
}

function selectionSnapshot(
  decision: MoneyNowSelectionDecision,
  selectorInputHash: string,
): MoneyNowSelectionSnapshot {
  return {
    ...resourceFields(),
    p01PromptVersion: "P-01.v1.4.2",
    selectionStatus: decision.selectionStatus,
    selectedScenario: decision.selectedScenario,
    candidateTrace: decision.candidateTrace,
    rankingTrace: decision.rankingTrace,
    selectorInputHash,
  };
}

export async function runMoneyNowSelectorStage(
  analysisRunId: string,
  options: RunMoneyNowSelectorStageOptions = {},
): Promise<MoneyNowSelectorExecutionResult> {
  const repository = options.repository ?? createD1MoneyNowSelectorRepository();
  const source = await repository.loadSource(analysisRunId);
  if (!source) {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_ANALYSIS_RUN_NOT_FOUND",
      "Analysis run was not found.",
      "validation",
    );
  }
  const sourceSnapshot = await moneyNowSelectorSourceSnapshot(source);
  const existing = await repository.loadResult(analysisRunId);
  if (existing) {
    if (existing.deterministicInputHash !== sourceSnapshot.deterministicInputHash) {
      throw new MoneyNowSelectorStageError(
        "MONEY_NOW_SELECTOR_VERSION_CONFLICT",
        "Persisted P-01 or selector resource versions changed after immutable selection.",
        "version_conflict",
      );
    }
    const status = existing.failure ? "analysis_failed" : "money_now";
    await repository.updateRun(analysisRunId, {
      status,
      errorCode: existing.failure?.code ?? null,
      errorMessage: existing.failure?.message ?? null,
      metadata: {
        ...resourceFields(),
        deterministicInputHash: existing.deterministicInputHash,
        selectorInputHash: existing.selectorInputHash,
        selectionStatus: existing.snapshot?.selectionStatus ?? null,
        selectedScenarioId: existing.snapshot?.selectedScenario?.scenarioId ?? null,
        idempotentReplay: true,
      },
    });
    return {
      analysisRunId,
      status,
      idempotentReplay: true,
      nextStep: nextStep(analysisRunId, existing.snapshot),
      result: existing,
    };
  }

  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const startedAt = now().toISOString();
  try {
    const prepared = await prepareMoneyNowSelectorInput(source);
    const decision = (options.selector ?? selectMoneyNowCandidate)(prepared.selectorInput);
    const snapshot = selectionSnapshot(decision, prepared.selectorInputHash);
    const completedAt = now().toISOString();
    const persisted = await persistOrLoad(repository, {
      id: createId(),
      diagnosticId: source.diagnosticId,
      analysisRunId,
      p01AnalysisResultId: prepared.p01AnalysisResultId,
      p01ResultHash: prepared.p01ResultHash,
      taskResolverPlanId: prepared.taskResolverPlanId,
      taskResolverPlanHash: prepared.taskResolverPlanHash,
      ...resourceFields(),
      selectorInputHash: prepared.selectorInputHash,
      deterministicInputHash: prepared.deterministicInputHash,
      selectorInput: prepared.selectorInput,
      snapshot,
      startedAt,
      completedAt,
      failure: null,
    });
    if (persisted.result.failure) {
      throw new MoneyNowSelectorStageError(
        "MONEY_NOW_SELECTOR_PERSISTED_FAILURE_CONFLICT",
        "A failed immutable selector snapshot already exists for this input.",
        "version_conflict",
      );
    }
    await repository.updateRun(analysisRunId, {
      status: "money_now",
      errorCode: null,
      errorMessage: null,
      metadata: {
        ...resourceFields(),
        p01ResultHash: prepared.p01ResultHash,
        taskResolverPlanId: prepared.taskResolverPlanId,
        taskResolverPlanHash: prepared.taskResolverPlanHash,
        selectorInputHash: prepared.selectorInputHash,
        deterministicInputHash: prepared.deterministicInputHash,
        selectionStatus: persisted.result.snapshot!.selectionStatus,
        selectedScenarioId: persisted.result.snapshot!.selectedScenario?.scenarioId ?? null,
        idempotentReplay: persisted.replay,
        startedAt,
        completedAt,
      },
    });
    return {
      analysisRunId,
      status: "money_now",
      idempotentReplay: persisted.replay,
      nextStep: nextStep(analysisRunId, persisted.result.snapshot),
      result: persisted.result,
    };
  } catch (unknownError) {
    const error = asMoneyNowSelectorStageError(unknownError);
    if (error.kind === "version_conflict") throw error;
    const completedAt = now().toISOString();
    const failed = await persistOrLoad(repository, {
      id: createId(),
      diagnosticId: source.diagnosticId,
      analysisRunId,
      p01AnalysisResultId: source.p01.id,
      p01ResultHash: sourceSnapshot.p01ResultHash,
      taskResolverPlanId: source.taskResolver?.id ?? null,
      taskResolverPlanHash: source.taskResolver?.plan
        ? await sha256(source.taskResolver.plan)
        : null,
      ...resourceFields(),
      selectorInputHash: null,
      deterministicInputHash: sourceSnapshot.deterministicInputHash,
      selectorInput: null,
      snapshot: null,
      startedAt,
      completedAt,
      failure: {
        code: error.code,
        message: error.message,
        kind: error.kind,
        details: error.details,
      },
    });
    await repository.updateRun(analysisRunId, {
      status: "analysis_failed",
      errorCode: failed.result.failure?.code ?? error.code,
      errorMessage: failed.result.failure?.message ?? error.message,
      metadata: {
        ...resourceFields(),
        deterministicInputHash: sourceSnapshot.deterministicInputHash,
        failureKind: error.kind,
        idempotentReplay: failed.replay,
        startedAt,
        completedAt,
      },
    });
    return {
      analysisRunId,
      status: "analysis_failed",
      idempotentReplay: failed.replay,
      nextStep: null,
      result: failed.result,
    };
  }
}
