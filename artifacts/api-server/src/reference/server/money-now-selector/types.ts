import type {
  MoneyNowCandidateTrace,
  MoneyNowRankingComparison,
  MoneyNowSelectedScenario,
  MoneyNowSelectorInputV1_1,
} from "@/server/7k/money-now-selector";
export type { MoneyNowSelectorInputV1_1 } from "@/server/7k/money-now-selector";
import type { P01ResultV1_4_2 } from "@/server/p01/types";
import type { ResolvedTransitionPlan } from "@/server/task-resolver/types";

export const MONEY_NOW_SELECTOR_STAGE_VERSION =
  "money-now-selector-stage.v1" as const;
export const MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256 =
  "caef74cee52cfd061fdf0e962d9624fb8ff2024d7a515493ce2c6e48ca91ad5c" as const;
export const MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256 =
  "85c9b26e03f7583e3d46f995be4cf400b8f2bfcfc2842675627ae9497041045b" as const;

export type MoneyNowSelectionSnapshot = {
  stageVersion: typeof MONEY_NOW_SELECTOR_STAGE_VERSION;
  selectorContractVersion: "money-now-selector-contract.v1.2";
  selectorContractJsonSha256: typeof MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256;
  selectorContractTsSha256: typeof MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256;
  businessMethodologyVersion: "money-now.v2.2";
  factExtractionVersion: "money-now-fact-extraction.v1";
  p01PromptVersion: "P-01.v1.4.2";
  selectionStatus: "selected" | "no_eligible_scenario";
  selectedScenario: MoneyNowSelectedScenario | null;
  candidateTrace: MoneyNowCandidateTrace[];
  rankingTrace: {
    orderedScenarioIds: Array<MoneyNowCandidateTrace["scenarioId"]>;
    comparisons: MoneyNowRankingComparison[];
  };
  selectorInputHash: string;
};

export type MoneyNowSelectorFailureKind =
  | "upstream_blocked"
  | "validation"
  | "integrity"
  | "technical"
  | "version_conflict";

export type MoneyNowSelectorFailure = {
  code: string;
  message: string;
  kind: Exclude<MoneyNowSelectorFailureKind, "version_conflict">;
  details: unknown;
};

export type MoneyNowSelectorSource = {
  analysisRunId: string;
  diagnosticId: string;
  runStatus: string;
  p01: {
    id: string | null;
    promptVersion: string | null;
    outputSchemaVersion: string | null;
    inputHash: string | null;
    result: P01ResultV1_4_2 | null;
    failureCode: string | null;
  };
  taskResolver: {
    id: string;
    p01AnalysisResultId: string | null;
    stageVersion: string;
    transitionRegistryVersion: string;
    deterministicInputHash: string;
    plan: ResolvedTransitionPlan | null;
    failureCode: string | null;
    failureMessage: string | null;
  } | null;
};

export type PreparedMoneyNowSelectorInput = {
  selectorInput: MoneyNowSelectorInputV1_1;
  p01AnalysisResultId: string;
  p01ResultHash: string;
  taskResolverPlanId: string;
  taskResolverPlanHash: string;
  selectorInputHash: string;
  deterministicInputHash: string;
};

export type StoredMoneyNowSelection = {
  id: string;
  diagnosticId: string;
  analysisRunId: string;
  p01AnalysisResultId: string | null;
  p01ResultHash: string | null;
  taskResolverPlanId: string | null;
  taskResolverPlanHash: string | null;
  stageVersion: typeof MONEY_NOW_SELECTOR_STAGE_VERSION;
  selectorContractVersion: "money-now-selector-contract.v1.2";
  selectorContractJsonSha256: typeof MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256;
  selectorContractTsSha256: typeof MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256;
  businessMethodologyVersion: "money-now.v2.2";
  factExtractionVersion: "money-now-fact-extraction.v1";
  selectorInputHash: string | null;
  deterministicInputHash: string;
  selectorInput: MoneyNowSelectorInputV1_1 | null;
  snapshot: MoneyNowSelectionSnapshot | null;
  startedAt: string;
  completedAt: string;
  failure: MoneyNowSelectorFailure | null;
};

export interface MoneyNowSelectorRepository {
  loadSource(analysisRunId: string): Promise<MoneyNowSelectorSource | null>;
  loadResult(analysisRunId: string): Promise<StoredMoneyNowSelection | null>;
  createResult(result: StoredMoneyNowSelection): Promise<boolean>;
  updateRun(
    analysisRunId: string,
    update: {
      status: "money_now" | "analysis_failed";
      errorCode: string | null;
      errorMessage: string | null;
      metadata: Record<string, unknown>;
    },
  ): Promise<void>;
}

export type MoneyNowSelectorExecutionResult = {
  analysisRunId: string;
  status: "money_now" | "analysis_failed";
  idempotentReplay: boolean;
  nextStep: string | null;
  result: StoredMoneyNowSelection;
};
