import { SEVEN_K_ELEMENT_IDS, type SevenKScores } from "@/server/7k/types";
import { finalizeAndValidateP04Output } from "@/server/p04/validation";
import { sha256, stableJson } from "@/server/stage4/hash";
import type { P04PreparedInput } from "@/server/p04/stage-types";
import { AnalysisResultError } from "./errors";
import {
  ANALYSIS_RESULT_ASSEMBLER_VERSION,
  ANALYSIS_RESULT_METHODOLOGY_VERSION,
  ANALYSIS_RESULT_VERSION,
  ANALYSIS_RESULT_VERSIONS,
  type AnalysisResultSource,
  type AnalysisResultV1,
} from "./types";

function fail(
  code: string,
  message: string,
  kind: ConstructorParameters<typeof AnalysisResultError>[2] = "integrity",
): never {
  throw new AnalysisResultError(code, message, kind);
}

function preparedP04(source: NonNullable<AnalysisResultSource["p04"]>): P04PreparedInput {
  return {
    p01AnalysisResultId: source.p01AnalysisResultId,
    targetArchetypeResultId: source.targetArchetypeResultId,
    p02AnalysisResultId: source.p02AnalysisResultId,
    resolvedTransitionPlanId: source.resolvedTransitionPlanId,
    moneyNowSelectionId: source.moneyNowSelectionId,
    p03PrescriptionResultId: source.p03PrescriptionResultId,
    upstreamHashes: source.upstreamHashes,
    context: source.context,
    contextHash: source.contextHash,
    reportPolicy: source.reportPolicy,
    sourceRegistry: source.sourceRegistry,
    sourceRegistryHash: source.sourceRegistryHash,
    reportGlossary: source.reportGlossary,
    ruleVersions: source.ruleVersions,
    inputHash: source.inputHash,
    deterministicInputHash: source.deterministicInputHash,
  };
}

function assertFrozenVersions(source: AnalysisResultSource): void {
  const p03 = source.p03;
  const p04 = source.p04;
  if (!p03 || !p04) fail("ANALYSIS_RESULT_UPSTREAM_MISSING", "Persisted P-03 and P-04 results are required.", "not_ready");
  if (p03.promptVersion !== "P-03.v1.5" || p03.outputSchemaVersion !== "1.5") {
    fail("ANALYSIS_RESULT_P03_VERSION_UNSUPPORTED", "Final assembly requires P-03.v1.5/schema 1.5.", "version_conflict");
  }
  if (
    p03.ruleVersions.selectorContract !== "money-now-selector-contract.v1.1" ||
    p03.ruleVersions.selectorMethodology !== "money-now.v2.2" ||
    p03.ruleVersions.prescriptionMethodology !== "money-now.v2.3"
  ) {
    fail("ANALYSIS_RESULT_MONEY_NOW_VERSION_UNSUPPORTED", "Persisted Money Now versions differ from the frozen contract.", "version_conflict");
  }
  if (p04.promptVersion !== "P-04.v1.2" || p04.outputSchemaVersion !== "1.2") {
    fail("ANALYSIS_RESULT_P04_VERSION_UNSUPPORTED", "Final assembly requires P-04.v1.2/schema 1.2.", "version_conflict");
  }
  const versions = p04.ruleVersions;
  if (
    versions.p01Prompt !== "P-01.v1.4.1" ||
    versions.p01Schema !== "1.4" ||
    versions.targetStage !== "target-archetype-stage.v1" ||
    versions.targetRules !== "target-rules.v2.1" ||
    versions.archetypes !== "archetypes.v1" ||
    versions.p02Prompt !== "P-02.v1.3" ||
    versions.p02Schema !== "1.3" ||
    versions.taskResolver !== "task-resolver-stage.v1" ||
    versions.transitions !== "transitions-70.v1" ||
    versions.moneyNowSelector !== "money-now-selector-stage.v1" ||
    versions.moneyNowSelectorContract !== "money-now-selector-contract.v1.1" ||
    versions.p03Prompt !== "P-03.v1.5" ||
    versions.p03Schema !== "1.5"
  ) {
    fail("ANALYSIS_RESULT_UPSTREAM_VERSION_UNSUPPORTED", "P-04 upstream version manifest differs from the frozen Stage 10 contract.", "version_conflict");
  }
}

function assertMoneyNowChain(source: AnalysisResultSource): void {
  const p03 = source.p03!;
  const p04 = source.p04!;
  const context = p04.context.moneyNow;
  if (p04.p03PrescriptionResultId !== p03.id) {
    fail("ANALYSIS_RESULT_P03_ID_CONFLICT", "P-04 does not reference the persisted P-03 result.", "version_conflict");
  }
  if (context.selectionStatus === "no_eligible_scenario") {
    if (p03.result !== null || p03.skippedOutcome === null || context.p03Result !== null) {
      fail("ANALYSIS_RESULT_NO_ELIGIBLE_CONFLICT", "No-eligible Money Now state contains a prescription or lacks the persisted skipped outcome.");
    }
    return;
  }
  if (!p03.result || !context.p03Result || p03.skippedOutcome !== null) {
    fail("ANALYSIS_RESULT_P03_OUTCOME_CONFLICT", "Selected Money Now scenario requires exactly one persisted P-03 result.");
  }
  if (stableJson(p03.result) !== stableJson(context.p03Result)) {
    fail("ANALYSIS_RESULT_P03_PROJECTION_CONFLICT", "P-04 context changed the persisted P-03 result.", "version_conflict");
  }
}

function currentScores(source: AnalysisResultSource): SevenKScores {
  const current7k = source.p04!.context.current.current7k;
  return Object.fromEntries(
    SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, current7k[elementId].score]),
  ) as SevenKScores;
}

function assertFixedFirstAction(source: AnalysisResultSource): void {
  const p04 = source.p04!;
  const firstTask = p04.context.resolvedPlan.cards[0]?.tasks[0];
  if (!firstTask) fail("ANALYSIS_RESULT_FIRST_TASK_MISSING", "Resolved route has no first fixed task.");
  if (
    p04.result!.finalFocus.first_task_id !== firstTask.taskId ||
    p04.result!.finalFocus.first_action !== firstTask.task
  ) {
    fail("ANALYSIS_RESULT_FIRST_ACTION_CONFLICT", "P-04 final focus is not the exact first fixed task.");
  }
}

export async function assembleAnalysisResult(
  source: AnalysisResultSource,
): Promise<AnalysisResultV1> {
  if (source.runStatus !== "ready") {
    fail("ANALYSIS_RESULT_NOT_READY", `Analysis run status=${source.runStatus}; expected ready.`, "not_ready");
  }
  if (!source.p03 || !source.p04 || source.p03.failureCode || source.p04.failureCode || !source.p04.result) {
    fail("ANALYSIS_RESULT_UPSTREAM_MISSING", "Successful persisted P-03 and P-04 results are required.", "not_ready");
  }
  if (source.analysisRunId !== source.p03.analysisRunId || source.analysisRunId !== source.p04.analysisRunId) {
    fail("ANALYSIS_RESULT_RUN_ID_CONFLICT", "Upstream records do not belong to the requested analysis run.", "version_conflict");
  }
  if (source.diagnosticId !== source.p03.diagnosticId || source.diagnosticId !== source.p04.diagnosticId) {
    fail("ANALYSIS_RESULT_DIAGNOSTIC_ID_CONFLICT", "Upstream records do not belong to one diagnostic.", "version_conflict");
  }

  assertFrozenVersions(source);
  assertMoneyNowChain(source);
  finalizeAndValidateP04Output(source.p04.result, preparedP04(source.p04));
  assertFixedFirstAction(source);

  const persistedP03Outcome = source.p03.result ?? source.p03.skippedOutcome;
  const persistedP03Hash = await sha256(persistedP03Outcome);
  if (persistedP03Hash !== source.p04.upstreamHashes.p03ResultHash) {
    fail("ANALYSIS_RESULT_P03_HASH_CONFLICT", "Persisted P-03 result no longer matches the immutable P-04 input hash.", "version_conflict");
  }

  const p04 = source.p04;
  const context = p04.context;
  const report = p04.result;
  if (!report) fail("ANALYSIS_RESULT_P04_RESULT_MISSING", "Persisted P-04 report is missing.", "not_ready");
  const assemblyInputHash = await sha256({
    assemblerVersion: ANALYSIS_RESULT_ASSEMBLER_VERSION,
    versions: ANALYSIS_RESULT_VERSIONS,
    analysisRunId: source.analysisRunId,
    diagnosticId: source.diagnosticId,
    p04ResultId: p04.id,
    p04DeterministicInputHash: p04.deterministicInputHash,
    p04Result: report,
    p03ResultId: source.p03.id,
    p03Outcome: persistedP03Outcome,
  });

  return {
    version: ANALYSIS_RESULT_VERSION,
    methodologyVersion: ANALYSIS_RESULT_METHODOLOGY_VERSION,
    analysisRunId: source.analysisRunId,
    diagnosticId: source.diagnosticId,
    analysisStatus: p04.reportPolicy.analysisStatus,
    versions: ANALYSIS_RESULT_VERSIONS,
    clientContext: structuredClone(context.clientContext),
    current: {
      scores: currentScores(source),
      current7k: structuredClone(context.current.current7k),
      businessMap: structuredClone(context.current.businessMap),
    },
    target: structuredClone(context.target),
    archetype: structuredClone(context.archetype),
    strategy: {
      constraint: structuredClone(context.strategy.constraint),
      perceivedVsEvidenced: structuredClone(context.strategy.perceivedVsEvidenced),
      previousAttemptsAnalysis: structuredClone(context.strategy.previousAttemptsAnalysis),
      bundle: structuredClone(context.strategy.bundle),
      elementSequence: structuredClone(context.strategy.elementSequence),
      businessValidation: structuredClone(context.strategy.businessValidation),
    },
    route: structuredClone(context.resolvedPlan),
    moneyNow: {
      status: p04.reportPolicy.moneyNowStatus,
      selectionStatus: context.moneyNow.selectionStatus,
      selectedScenario: structuredClone(context.moneyNow.selectedScenario),
      prescription: structuredClone(source.p03.result),
      skippedOutcome: structuredClone(source.p03.skippedOutcome),
      narrative: structuredClone(report.moneyNow),
    },
    report: structuredClone(report),
    finalFocus: structuredClone(report.finalFocus),
    provenance: {
      upstreamIds: {
        p01AnalysisResultId: p04.p01AnalysisResultId,
        targetArchetypeResultId: p04.targetArchetypeResultId,
        p02AnalysisResultId: p04.p02AnalysisResultId,
        resolvedTransitionPlanId: p04.resolvedTransitionPlanId,
        moneyNowSelectionId: p04.moneyNowSelectionId,
        p03PrescriptionResultId: p04.p03PrescriptionResultId,
        p04ReportResultId: p04.id,
      },
      upstreamHashes: structuredClone(p04.upstreamHashes),
      p04DeterministicInputHash: p04.deterministicInputHash,
      assemblyInputHash,
    },
  };
}
