import { assembleAnalysisResult } from "./assembler";
import { AnalysisResultError } from "./errors";
import { createD1AnalysisResultRepository } from "./repository";
import {
  ANALYSIS_RESULT_METHODOLOGY_VERSION,
  ANALYSIS_RESULT_VERSION,
  type AnalysisResultExecution,
  type AssembleAnalysisResultOptions,
  type StoredAnalysisResult,
} from "./types";
import { validateAnalysisResult } from "./validation";

function assertReplayCompatible(
  existing: StoredAnalysisResult,
  candidate: StoredAnalysisResult,
): void {
  if (
    existing.schemaVersion !== ANALYSIS_RESULT_VERSION ||
    existing.methodologyVersion !== ANALYSIS_RESULT_METHODOLOGY_VERSION ||
    existing.result.provenance.assemblyInputHash !== candidate.result.provenance.assemblyInputHash
  ) {
    throw new AnalysisResultError(
      "ANALYSIS_RESULT_VERSION_CONFLICT",
      "A final result already exists for another immutable upstream/version snapshot.",
      "version_conflict",
    );
  }
  validateAnalysisResult(existing.result);
}

export async function getOrCreateAnalysisResult(
  analysisRunId: string,
  options: AssembleAnalysisResultOptions = {},
): Promise<AnalysisResultExecution> {
  const repository = options.repository ?? createD1AnalysisResultRepository();
  const source = await repository.loadSource(analysisRunId);
  if (!source) {
    throw new AnalysisResultError("ANALYSIS_RESULT_RUN_NOT_FOUND", "Analysis run was not found.", "not_found");
  }
  const result = validateAnalysisResult(await assembleAnalysisResult(source));
  const candidate: StoredAnalysisResult = {
    id: (options.createId ?? (() => crypto.randomUUID()))(),
    diagnosticId: source.diagnosticId,
    analysisRunId,
    schemaVersion: ANALYSIS_RESULT_VERSION,
    methodologyVersion: ANALYSIS_RESULT_METHODOLOGY_VERSION,
    result,
  };
  const existing = await repository.loadResult(analysisRunId);
  if (existing) {
    assertReplayCompatible(existing, candidate);
    return { result: existing.result, idempotentReplay: true };
  }
  if (await repository.createResult(candidate)) {
    return { result, idempotentReplay: false };
  }
  const conflicted = await repository.loadResult(analysisRunId);
  if (!conflicted) {
    throw new AnalysisResultError("ANALYSIS_RESULT_PERSISTENCE_CONFLICT", "Insert conflicted but no final result exists.", "integrity");
  }
  assertReplayCompatible(conflicted, candidate);
  return { result: conflicted.result, idempotentReplay: true };
}
