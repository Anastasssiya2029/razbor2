import { P04_PROMPT_SHA256 } from "../../server/7k/prompts/p04.v1.2";
import { buildP04ReportPolicy, buildP04SourceRegistry, prepareP04Input } from "../../server/p04/projections";
import type { P04PreparedInput, StoredP04Result } from "../../server/p04/stage-types";
import { finalizeAndValidateP04Output } from "../../server/p04/validation";
import { sha256 } from "../../server/stage4/hash";
import type { AnalysisResultSource } from "../../server/analysis-result/types";
import { makeP04Source, makeValidP04Output, type P04FixtureMoneyStatus } from "./p04-fixture";

function preparedFromStored(p04: StoredP04Result): P04PreparedInput {
  return {
    p01AnalysisResultId: p04.p01AnalysisResultId,
    targetArchetypeResultId: p04.targetArchetypeResultId,
    p02AnalysisResultId: p04.p02AnalysisResultId,
    resolvedTransitionPlanId: p04.resolvedTransitionPlanId,
    moneyNowSelectionId: p04.moneyNowSelectionId,
    p03PrescriptionResultId: p04.p03PrescriptionResultId,
    upstreamHashes: p04.upstreamHashes,
    context: p04.context,
    contextHash: p04.contextHash,
    reportPolicy: p04.reportPolicy,
    sourceRegistry: p04.sourceRegistry,
    sourceRegistryHash: p04.sourceRegistryHash,
    reportGlossary: p04.reportGlossary,
    ruleVersions: p04.ruleVersions,
    inputHash: p04.inputHash,
    deterministicInputHash: p04.deterministicInputHash,
  };
}

function storedP04(
  prepared: P04PreparedInput,
  result: StoredP04Result["result"],
): StoredP04Result {
  return {
    id: "p04-1",
    diagnosticId: "diag-1",
    analysisRunId: "run-1",
    p01AnalysisResultId: prepared.p01AnalysisResultId,
    targetArchetypeResultId: prepared.targetArchetypeResultId,
    p02AnalysisResultId: prepared.p02AnalysisResultId,
    resolvedTransitionPlanId: prepared.resolvedTransitionPlanId,
    moneyNowSelectionId: prepared.moneyNowSelectionId,
    p03PrescriptionResultId: prepared.p03PrescriptionResultId,
    upstreamHashes: prepared.upstreamHashes,
    stageVersion: "p04-report-writer-stage.v1",
    promptVersion: "P-04.v1.2",
    outputSchemaVersion: "1.2",
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
    result,
    providerRawResponse: null,
    provider: "fixture",
    model: "fixture",
    startedAt: "2026-08-19T10:00:05.000Z",
    finishedAt: "2026-08-19T10:00:06.000Z",
    latencyMs: 1,
    inputTokens: 1,
    outputTokens: 1,
    totalTokens: 2,
    costUsd: 0,
    retryCount: 0,
    technicalRetryCount: 0,
    reevaluationRetryCount: 0,
    attemptDiagnostics: [],
    failureCode: null,
    failureMessage: null,
  };
}

export async function makeAnalysisResultFixture(
  status: P04FixtureMoneyStatus = "available",
): Promise<AnalysisResultSource> {
  const source = await makeP04Source(status);
  const prepared = await prepareP04Input(source);
  const result = finalizeAndValidateP04Output(makeValidP04Output(prepared), prepared);
  return {
    analysisRunId: source.analysisRunId,
    diagnosticId: source.diagnosticId,
    runStatus: "ready",
    p03: structuredClone(source.p03),
    p04: storedP04(prepared, result),
  };
}

/** Rebuilds all Stage 10 hashes/policies after a test mutates persisted snapshots. */
export async function refreshAnalysisResultFixture(
  source: AnalysisResultSource,
): Promise<AnalysisResultSource> {
  if (!source.p03 || !source.p04) throw new Error("Fixture requires P-03 and P-04.");
  const p04 = source.p04;
  p04.context.moneyNow.p03Result = structuredClone(source.p03.result);
  p04.context.moneyNow.p03OutcomeStatus = source.p03.result?.analysisStatus ?? "skipped_no_eligible_scenario";
  p04.context.moneyNow.lockedTeaser = source.p03.lockedTeaser;
  p04.contextHash = await sha256(p04.context);
  p04.upstreamHashes.p03ResultHash = await sha256(source.p03.result ?? source.p03.skippedOutcome);
  p04.reportPolicy = buildP04ReportPolicy(p04.context);
  p04.sourceRegistry = buildP04SourceRegistry(p04.context);
  p04.sourceRegistryHash = await sha256(p04.sourceRegistry);
  p04.deterministicInputHash = await sha256({
    fixture: "stage10",
    p03: source.p03.deterministicInputHash,
    upstreamHashes: p04.upstreamHashes,
    contextHash: p04.contextHash,
    reportPolicy: p04.reportPolicy,
    sourceRegistryHash: p04.sourceRegistryHash,
    ruleVersions: p04.ruleVersions,
  });
  p04.inputHash = p04.deterministicInputHash;
  const prepared = preparedFromStored(p04);
  p04.result = finalizeAndValidateP04Output(makeValidP04Output(prepared), prepared);
  return source;
}
