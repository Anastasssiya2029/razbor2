import type { P01ResultV1_4_2 } from "@/server/p01/types";
import type { StoredP02Result } from "@/server/p02/stage-types";
import type { StoredP03Result } from "@/server/p03/stage-types";
import type { StoredTargetArchetypeResult } from "@/server/stage4/types";
import type { StoredResolvedTransitionPlan } from "@/server/task-resolver/types";
import type { StoredMoneyNowSelection } from "@/server/money-now-selector/types";
import type {
  P04AttemptDiagnostic,
  P04Context,
  P04Provider,
  P04ReportPolicy,
  P04ResultV1_2,
  P04RuleVersions,
  P04SourceRegistry,
  P04UpstreamHashes,
} from "./types";

export type P04Source = {
  analysisRunId: string;
  diagnosticId: string;
  runStatus: string;
  clientContext: {
    expertName: string | null;
    niche: string | null;
  };
  p01: {
    id: string | null;
    promptVersion: string | null;
    outputSchemaVersion: string | null;
    result: P01ResultV1_4_2 | null;
    failureCode: string | null;
  };
  targetStage: StoredTargetArchetypeResult | null;
  p02: StoredP02Result | null;
  resolvedPlan: StoredResolvedTransitionPlan | null;
  moneyNowSelection: StoredMoneyNowSelection | null;
  p03: StoredP03Result | null;
};

export type P04PreparedInput = {
  p01AnalysisResultId: string;
  targetArchetypeResultId: string;
  p02AnalysisResultId: string;
  resolvedTransitionPlanId: string;
  moneyNowSelectionId: string;
  p03PrescriptionResultId: string;
  upstreamHashes: P04UpstreamHashes;
  context: P04Context;
  contextHash: string;
  reportPolicy: P04ReportPolicy;
  sourceRegistry: P04SourceRegistry;
  sourceRegistryHash: string;
  reportGlossary: Record<string, unknown>;
  ruleVersions: P04RuleVersions;
  inputHash: string;
  deterministicInputHash: string;
};

export type StoredP04Result = {
  id: string;
  diagnosticId: string;
  analysisRunId: string;
  p01AnalysisResultId: string;
  targetArchetypeResultId: string;
  p02AnalysisResultId: string;
  resolvedTransitionPlanId: string;
  moneyNowSelectionId: string;
  p03PrescriptionResultId: string;
  upstreamHashes: P04UpstreamHashes;
  stageVersion: "p04-report-writer-stage.v1";
  promptVersion: "P-04.v1.3";
  outputSchemaVersion: "1.3";
  promptSha256: string;
  ruleVersions: P04RuleVersions;
  context: P04Context;
  contextHash: string;
  reportPolicy: P04ReportPolicy;
  sourceRegistry: P04SourceRegistry;
  sourceRegistryHash: string;
  reportGlossary: Record<string, unknown>;
  inputHash: string;
  deterministicInputHash: string;
  result: P04ResultV1_2 | null;
  providerRawResponse: unknown;
  provider: string;
  model: string;
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
  attemptDiagnostics: P04AttemptDiagnostic[];
  failureCode: string | null;
  failureMessage: string | null;
};

export interface P04Repository {
  loadSource(analysisRunId: string): Promise<P04Source | null>;
  loadResult(analysisRunId: string): Promise<StoredP04Result | null>;
  createResult(result: StoredP04Result): Promise<boolean>;
  replaceFailedResult(result: StoredP04Result): Promise<boolean>;
  updateRun(
    analysisRunId: string,
    update: {
      status: "ready" | "analysis_failed";
      errorCode: string | null;
      errorMessage: string | null;
      promptVersion: "P-04.v1.3";
      metadata: Record<string, unknown>;
    },
  ): Promise<void>;
}

export type RunP04StageOptions = {
  repository?: P04Repository;
  provider?: P04Provider;
  now?: () => Date;
  createId?: () => string;
  moneyNowEnabled?: boolean;
  retryFailed?: boolean;
};

export type P04StageExecutionResult = {
  analysisRunId: string;
  status: "ready" | "analysis_failed";
  idempotentReplay: boolean;
  nextStep: null;
  reportStoredServerSide: boolean;
};
