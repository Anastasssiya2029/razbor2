import { getTargetArchetypeResourceVersions } from "@/server/7k/methodology-registry";
import { computeTargetAndArchetype } from "./compute";
import { asStage4Error, Stage4Error } from "./errors";
import { sha256 } from "./hash";
import { createD1TargetArchetypeRepository } from "./repository";
import type {
  Stage4ExecutionResult,
  Stage4Source,
  StoredTargetArchetypeResult,
  TargetArchetypeRepository,
  TargetArchetypeResourceVersions,
} from "./types";
import { validateTargetArchetypeComputation } from "./validation";

export type RunTargetAndArchetypeOptions = {
  repository?: TargetArchetypeRepository;
  now?: () => Date;
  createId?: () => string;
  compute?: typeof computeTargetAndArchetype;
};

async function versionSnapshot(): Promise<TargetArchetypeResourceVersions> {
  return getTargetArchetypeResourceVersions() as TargetArchetypeResourceVersions;
}

async function inputHashes(
  source: Stage4Source,
  versions: TargetArchetypeResourceVersions,
): Promise<{ p01ResultHash: string | null; deterministicInputHash: string }> {
  const p01ResultHash = source.p01Result ? await sha256(source.p01Result) : null;
  const deterministicInputHash = await sha256({
    analysisRunId: source.analysisRunId,
    p01AnalysisResultId: source.p01AnalysisResultId,
    p01InputHash: source.p01InputHash,
    p01ResultHash,
    versions,
  });
  return { p01ResultHash, deterministicInputHash };
}

function sameVersionedInput(
  stored: StoredTargetArchetypeResult,
  deterministicInputHash: string,
): boolean {
  return stored.deterministicInputHash === deterministicInputHash;
}

async function persistOrLoad(
  repository: TargetArchetypeRepository,
  record: StoredTargetArchetypeResult,
): Promise<{ record: StoredTargetArchetypeResult; replay: boolean }> {
  const inserted = await repository.createResult(record);
  if (inserted) return { record, replay: false };
  const concurrent = await repository.loadResult(record.analysisRunId);
  if (!concurrent) {
    throw new Stage4Error(
      "STAGE4_PERSISTENCE_CONFLICT",
      "Stage 4 result was not inserted and no existing record was found.",
      "technical",
    );
  }
  if (!sameVersionedInput(concurrent, record.deterministicInputHash)) {
    throw new Stage4Error(
      "STAGE4_VERSION_CONFLICT",
      "A result for this run already exists with a different P-01/rules snapshot.",
      "version_conflict",
      {
        storedInputHash: concurrent.deterministicInputHash,
        requestedInputHash: record.deterministicInputHash,
      },
    );
  }
  return { record: concurrent, replay: true };
}

export async function runTargetAndArchetypeStage(
  analysisRunId: string,
  options: RunTargetAndArchetypeOptions = {},
): Promise<Stage4ExecutionResult> {
  const repository = options.repository ?? createD1TargetArchetypeRepository();
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const compute = options.compute ?? computeTargetAndArchetype;
  const source = await repository.loadSource(analysisRunId);
  if (!source) {
    throw new Stage4Error(
      "STAGE4_ANALYSIS_RUN_NOT_FOUND",
      "Analysis run was not found.",
      "validation",
    );
  }
  const canRecordUpstreamBlock =
    source.runStatus === "analysis_failed" && source.p01AnalysisResultId !== null;
  if (
    source.runStatus !== "targeting" &&
    source.runStatus !== "strategizing" &&
    !canRecordUpstreamBlock
  ) {
    throw new Stage4Error(
      "STAGE4_NOT_READY",
      `Analysis run status=${source.runStatus}; expected targeting.`,
      "validation",
    );
  }

  const versions = await versionSnapshot();
  const hashes = await inputHashes(source, versions);
  const existing = await repository.loadResult(analysisRunId);
  if (existing) {
    if (!sameVersionedInput(existing, hashes.deterministicInputHash)) {
      throw new Stage4Error(
        "STAGE4_VERSION_CONFLICT",
        "An immutable stage-4 snapshot already exists for another P-01/rules input.",
        "version_conflict",
      );
    }
    const status = existing.failureCode === null ? "strategizing" : "analysis_failed";
    await repository.updateRun(analysisRunId, {
      status,
      errorCode: existing.failureCode,
      errorMessage: existing.failureMessage,
      methodologyMetadata: {
        stageVersion: versions.stageVersion,
        deterministicInputHash: existing.deterministicInputHash,
        resourceVersions: versions,
        idempotentReplay: true,
      },
    });
    return { analysisRunId, status, idempotentReplay: true, result: existing };
  }

  if (source.runStatus !== "targeting" && !canRecordUpstreamBlock) {
    throw new Stage4Error(
      "STAGE4_NOT_TARGETING",
      `Analysis run status=${source.runStatus}; Target/Archetype stage was not started.`,
      "validation",
    );
  }

  const startedAt = now().toISOString();
  try {
    const computation = validateTargetArchetypeComputation(compute(source));
    const completedAt = now().toISOString();
    const candidate: StoredTargetArchetypeResult = {
      id: createId(),
      diagnosticId: source.diagnosticId,
      analysisRunId,
      p01AnalysisResultId: source.p01AnalysisResultId,
      p01InputHash: source.p01InputHash,
      p01ResultHash: hashes.p01ResultHash,
      currentScores: computation.currentScores,
      targetInput: computation.targetInput,
      target: computation.target,
      archetype: computation.archetype,
      resourceVersions: computation.resourceVersions,
      deterministicInputHash: hashes.deterministicInputHash,
      startedAt,
      completedAt,
      failureCode: null,
      failureMessage: null,
    };
    const persisted = await persistOrLoad(repository, candidate);
    if (persisted.record.failureCode !== null) {
      throw new Stage4Error(
        "STAGE4_PERSISTED_FAILURE_CONFLICT",
        "A failed immutable stage-4 snapshot already exists for this input.",
        "version_conflict",
      );
    }
    await repository.updateRun(analysisRunId, {
      status: "strategizing",
      errorCode: null,
      errorMessage: null,
      methodologyMetadata: {
        stageVersion: versions.stageVersion,
        deterministicInputHash: hashes.deterministicInputHash,
        resourceVersions: versions,
        idempotentReplay: persisted.replay,
        startedAt,
        completedAt,
      },
    });
    return {
      analysisRunId,
      status: "strategizing",
      idempotentReplay: persisted.replay,
      result: persisted.record,
    };
  } catch (unknownError) {
    const error = asStage4Error(unknownError);
    if (error.kind === "version_conflict") throw error;
    const completedAt = now().toISOString();
    const failure: StoredTargetArchetypeResult = {
      id: createId(),
      diagnosticId: source.diagnosticId,
      analysisRunId,
      p01AnalysisResultId: source.p01AnalysisResultId,
      p01InputHash: source.p01InputHash,
      p01ResultHash: hashes.p01ResultHash,
      currentScores: null,
      targetInput: null,
      target: null,
      archetype: null,
      resourceVersions: versions,
      deterministicInputHash: hashes.deterministicInputHash,
      startedAt,
      completedAt,
      failureCode: error.code,
      failureMessage: error.message,
    };
    const persisted = await persistOrLoad(repository, failure);
    await repository.updateRun(analysisRunId, {
      status: "analysis_failed",
      errorCode: persisted.record.failureCode,
      errorMessage: persisted.record.failureMessage,
      methodologyMetadata: {
        stageVersion: versions.stageVersion,
        deterministicInputHash: hashes.deterministicInputHash,
        resourceVersions: versions,
        failureKind: error.kind,
        idempotentReplay: persisted.replay,
        startedAt,
        completedAt,
      },
    });
    return {
      analysisRunId,
      status: "analysis_failed",
      idempotentReplay: persisted.replay,
      result: persisted.record,
    };
  }
}
