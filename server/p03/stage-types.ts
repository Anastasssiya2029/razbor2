import type { P01ResultV1_4_1 } from "@/server/p01/types";
import type { StoredMoneyNowSelection } from "@/server/money-now-selector/types";
import type {
  BackendMetric,
  BackendRevenueScenario,
  P03Context,
  P03Provider,
  P03ResultV1_5,
  P03RuleVersions,
  P03SelectedScenarioProjection,
} from "./types";

export type P03Source = {
  analysisRunId: string;
  diagnosticId: string;
  runStatus: string;
  p01: {
    id: string | null;
    promptVersion: string | null;
    outputSchemaVersion: string | null;
    result: P01ResultV1_4_1 | null;
    failureCode: string | null;
  };
  moneyNowSelection: StoredMoneyNowSelection | null;
};

export type P03SkippedOutcome = {
  status: "skipped_no_eligible_scenario";
  p03Result: null;
  moneyNowSelectionId: string;
  reason: "no_eligible_scenario";
};

export type StoredP03Result = {
  id: string;
  diagnosticId: string;
  analysisRunId: string;
  moneyNowSelectionId: string;
  moneyNowSelectionHash: string;
  p01AnalysisResultId: string;
  p01ResultHash: string;
  stageVersion: "p03-money-now-prescription-stage.v1";
  promptVersion: "P-03.v1.5";
  outputSchemaVersion: "1.5";
  ruleVersions: P03RuleVersions;
  contextHash: string | null;
  inputHash: string;
  deterministicInputHash: string;
  context: P03Context | null;
  selectedScenario: P03SelectedScenarioProjection | null;
  backendMetrics: BackendMetric[];
  backendRevenueScenario: BackendRevenueScenario | null;
  lockedTeaserVersion: "money-now-locked-teaser.v1";
  lockedTeaser: string;
  result: P03ResultV1_5 | null;
  skippedOutcome: P03SkippedOutcome | null;
  providerRawResponse: unknown;
  provider: string | null;
  model: string | null;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  retryCount: number;
  technicalRetryCount: number;
  reevaluationRetryCount: number;
  failureCode: string | null;
  failureMessage: string | null;
};

export interface P03Repository {
  loadSource(analysisRunId: string): Promise<P03Source | null>;
  loadResult(analysisRunId: string): Promise<StoredP03Result | null>;
  createResult(result: StoredP03Result): Promise<boolean>;
  updateRun(
    analysisRunId: string,
    update: {
      status: "writing_report" | "analysis_failed";
      errorCode: string | null;
      errorMessage: string | null;
      promptVersion: "P-03.v1.5";
      metadata: Record<string, unknown>;
    },
  ): Promise<void>;
}

export type RunP03StageOptions = {
  repository?: P03Repository;
  provider?: P03Provider;
  now?: () => Date;
  createId?: () => string;
};

export type P03StageExecutionResult = {
  analysisRunId: string;
  status: "writing_report" | "analysis_failed";
  idempotentReplay: boolean;
  nextStep: string | null;
  publicTeaser: string | null;
  outcomeStatus: P03ResultV1_5["analysisStatus"] | "skipped_no_eligible_scenario" | "technical_failure";
  result: StoredP03Result;
};
