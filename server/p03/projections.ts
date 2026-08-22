import {
  assertMoneyNowPrescriptionRegistryIntegrity,
  getP03PrescriptionRulesProjection,
  MONEY_NOW_PRESCRIPTION_METHODOLOGY_VERSION,
  MONEY_NOW_PRESCRIPTION_RULES_VERSION,
} from "@/server/7k/config/money-now-prescription-rules.v1";
import { MONEY_NOW_FACT_EXTRACTION_VERSION } from "@/server/7k/config/money-now-fact-extraction.v1";
import { MONEY_NOW_SELECTOR_CONTRACT_VERSION } from "@/server/7k/config/money-now-selector-contract.v1";
import {
  MONEY_NOW_RESOURCE_VERSION,
  MONEY_NOW_SCENARIOS,
  type MoneyNowScenarioId,
} from "@/server/7k/config/money-now.v2.2";
import { validateP01Invariants, validateP01Schema } from "@/server/p01/validation";
import { sha256 } from "@/server/stage4/hash";
import { P03Error } from "./errors";
import { buildP03BackendMetrics, buildP03BackendRevenueScenario } from "./metrics";
import type { P03Source } from "./stage-types";
import {
  P03_LOCKED_TEASER,
  P03_LOCKED_TEASER_VERSION,
  P03_OUTPUT_SCHEMA_VERSION,
  P03_STAGE_VERSION,
  type P03Context,
  type P03RuleVersions,
  type P03SelectedScenarioProjection,
} from "./types";
import {
  P03_PROMPT_SHA256,
  P03_PROMPT_VERSION,
} from "@/server/7k/prompts/p03.v1.5";

export const P03_RULE_VERSIONS: P03RuleVersions = {
  selectorContract: "money-now-selector-contract.v1.2",
  selectorMethodology: "money-now.v2.2",
  prescriptionMethodology: "money-now.v2.3",
  prescriptionRules: "money-now-prescription-rules.v1",
  factExtraction: "money-now-fact-extraction.v1",
  promptSha256: P03_PROMPT_SHA256,
};

const SCENARIO_BY_ID = Object.fromEntries(
  MONEY_NOW_SCENARIOS.map((scenario) => [scenario.id, scenario]),
) as Record<MoneyNowScenarioId, (typeof MONEY_NOW_SCENARIOS)[number]>;

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

export type P03SelectedPreparedInput = {
  kind: "selected";
  p01AnalysisResultId: string;
  p01ResultHash: string;
  moneyNowSelectionId: string;
  moneyNowSelectionHash: string;
  context: P03Context;
  contextHash: string;
  selectedScenario: P03SelectedScenarioProjection;
  moneyScenarioRules: Record<string, unknown>;
  prescriptionRules: Record<string, unknown>;
  interventionLibrary: Record<string, unknown>;
  backendMetrics: ReturnType<typeof buildP03BackendMetrics>;
  backendRevenueScenario: ReturnType<typeof buildP03BackendRevenueScenario>;
  lockedTeaser: typeof P03_LOCKED_TEASER;
  ruleVersions: P03RuleVersions;
  inputHash: string;
  deterministicInputHash: string;
};

export type P03SkippedPreparedInput = {
  kind: "skipped";
  p01AnalysisResultId: string;
  p01ResultHash: string;
  moneyNowSelectionId: string;
  moneyNowSelectionHash: string;
  backendMetrics: [];
  backendRevenueScenario: null;
  lockedTeaser: typeof P03_LOCKED_TEASER;
  ruleVersions: P03RuleVersions;
  inputHash: string;
  deterministicInputHash: string;
};

export type P03PreparedInput = P03SelectedPreparedInput | P03SkippedPreparedInput;

export async function prepareP03Input(source: P03Source): Promise<P03PreparedInput> {
  const p01 = source.p01;
  const selection = source.moneyNowSelection;
  if (!p01.id || !p01.result || p01.failureCode) {
    throw new P03Error("P03_P01_MISSING", "A successful persisted P-01 result is required.", "upstream_blocked");
  }
  if (p01.promptVersion !== "P-01.v1.4.2" || p01.outputSchemaVersion !== "1.4") {
    throw new P03Error("P03_UNSUPPORTED_P01_VERSION", "P-03 accepts only persisted P-01.v1.4.2/schema 1.4.", "upstream_blocked");
  }
  try {
    validateP01Invariants(validateP01Schema(p01.result));
  } catch (error) {
    throw new P03Error("P03_P01_INVALID", error instanceof Error ? error.message : "Persisted P-01 is invalid.", "integrity", null, { cause: error });
  }
  if (!selection || selection.failure || !selection.snapshot) {
    throw new P03Error("P03_SELECTION_MISSING", selection?.failure?.message ?? "A successful immutable Stage 7 selection is required.", "upstream_blocked");
  }
  if (
    selection.selectorContractVersion !== MONEY_NOW_SELECTOR_CONTRACT_VERSION ||
    selection.businessMethodologyVersion !== MONEY_NOW_RESOURCE_VERSION ||
    selection.factExtractionVersion !== MONEY_NOW_FACT_EXTRACTION_VERSION ||
    selection.snapshot.p01PromptVersion !== "P-01.v1.4.2"
  ) {
    throw new P03Error("P03_SELECTION_VERSION_UNSUPPORTED", "Stage 7 selection versions do not match the approved P-03 preflight.", "upstream_blocked");
  }
  if (selection.p01AnalysisResultId !== p01.id) {
    throw new P03Error("P03_UPSTREAM_SNAPSHOT_CONFLICT", "Stage 7 and P-01 reference different persisted snapshots.", "version_conflict");
  }
  if (
    MONEY_NOW_PRESCRIPTION_RULES_VERSION !== "money-now-prescription-rules.v1" ||
    MONEY_NOW_PRESCRIPTION_METHODOLOGY_VERSION !== "money-now.v2.3"
  ) {
    throw new P03Error("P03_PRESCRIPTION_RESOURCE_VERSION_MISMATCH", "P-03 prescription resources are not v1/v2.3.", "integrity");
  }
  try {
    assertMoneyNowPrescriptionRegistryIntegrity();
  } catch (error) {
    throw new P03Error("P03_PRESCRIPTION_REGISTRY_INVALID", error instanceof Error ? error.message : "Prescription registry failed integrity validation.", "integrity", null, { cause: error });
  }
  if (containsLegacyProductId(p01.result)) {
    throw new P03Error("P03_LEGACY_ELEMENT_ID", "products_method is forbidden; use product_method only.", "validation");
  }

  const p01ResultHash = await sha256(p01.result);
  if (selection.p01ResultHash !== p01ResultHash) {
    throw new P03Error("P03_P01_HASH_MISMATCH", "Persisted P-01 hash differs from immutable Stage 7 selection.", "version_conflict");
  }
  const moneyNowSelectionHash = await sha256(selection.snapshot);
  const common = {
    p01AnalysisResultId: p01.id,
    p01ResultHash,
    moneyNowSelectionId: selection.id,
    moneyNowSelectionHash,
    lockedTeaser: P03_LOCKED_TEASER,
    ruleVersions: P03_RULE_VERSIONS,
  } as const;

  if (selection.snapshot.selectionStatus === "no_eligible_scenario") {
    if (selection.snapshot.selectedScenario !== null) {
      throw new P03Error("P03_SELECTION_INCONSISTENCY", "no_eligible_scenario must not contain selectedScenario.", "integrity");
    }
    const inputHash = await sha256({
      ...common,
      selectionStatus: "no_eligible_scenario",
      stageVersion: P03_STAGE_VERSION,
      promptVersion: P03_PROMPT_VERSION,
      outputSchemaVersion: P03_OUTPUT_SCHEMA_VERSION,
      lockedTeaserVersion: P03_LOCKED_TEASER_VERSION,
    });
    return {
      kind: "skipped",
      ...common,
      backendMetrics: [],
      backendRevenueScenario: null,
      inputHash,
      deterministicInputHash: inputHash,
    };
  }

  const selected = selection.snapshot.selectedScenario;
  if (!selected) throw new P03Error("P03_SELECTED_SCENARIO_MISSING", "Selected Stage 7 outcome has no scenario.", "integrity");
  const selectedTrace = selection.snapshot.candidateTrace.find(
    (candidate) => candidate.scenarioId === selected.scenarioId,
  );
  if (
    !selectedTrace ||
    !selectedTrace.includedInRanking ||
    !selectedTrace.historyGuardPassed ||
    selectedTrace.capacityFit === "no_fit"
  ) {
    throw new P03Error("P03_SELECTED_CANDIDATE_INVALID", "Selected candidate failed Stage 7 guard/capacity preflight.", "integrity");
  }
  const scenario = SCENARIO_BY_ID[selected.scenarioId];
  const selectedScenario: P03SelectedScenarioProjection = {
    scenario_id: selected.scenarioId,
    scenario_title: scenario.title,
    money_distance: selected.moneyDistance,
    proximity_rank: selected.proximityRank,
    proof_level: selected.proofLevel,
    capacity_fit: selected.capacityFit,
    model_fit: selected.modelFit,
    signal_speed_rank: selected.signalSpeedRank,
    complexity: selected.complexity,
    evidence_ids: [...selected.evidenceIds],
  };
  const selectedScenarioFacts = Object.fromEntries(
    selectedTrace.requiredFacts.map((fact) => [fact.factCode, p01.result!.moneyNowFacts[fact.factCode]]),
  );
  const context: P03Context = {
    evidenceLedger: structuredClone(p01.result.evidenceLedger),
    current7k: structuredClone(p01.result.current7k),
    businessMap: structuredClone(p01.result.businessMap),
    moneyChainFacts: structuredClone(p01.result.moneyChainFacts),
    selectedScenarioFacts: structuredClone(selectedScenarioFacts),
    selectedScenarioHistory: structuredClone(p01.result.moneyNowHistory[selected.scenarioId]),
    selectedCandidateTrace: structuredClone(selectedTrace),
  };
  const contextHash = await sha256(context);
  const projection = getP03PrescriptionRulesProjection(selected.scenarioId);
  const backendMetrics = buildP03BackendMetrics(p01.result.moneyChainFacts);
  const backendRevenueScenario = buildP03BackendRevenueScenario();
  const moneyScenarioRules = {
    businessMethodologyVersion: MONEY_NOW_PRESCRIPTION_METHODOLOGY_VERSION,
    selectorScenarioDefinitionVersion: MONEY_NOW_RESOURCE_VERSION,
    scenario: structuredClone(scenario),
  };
  const { interventionLibrary, ...prescriptionRules } = projection;
  const inputHash = await sha256({
    ...common,
    contextHash,
    selectedScenario,
    moneyScenarioRules,
    prescriptionRules,
    interventionLibrary,
    backendMetrics,
    backendRevenueScenario,
    stageVersion: P03_STAGE_VERSION,
    promptVersion: P03_PROMPT_VERSION,
    outputSchemaVersion: P03_OUTPUT_SCHEMA_VERSION,
    lockedTeaserVersion: P03_LOCKED_TEASER_VERSION,
  });
  return {
    kind: "selected",
    ...common,
    context,
    contextHash,
    selectedScenario,
    moneyScenarioRules,
    prescriptionRules,
    interventionLibrary,
    backendMetrics,
    backendRevenueScenario,
    inputHash,
    deterministicInputHash: inputHash,
  };
}
