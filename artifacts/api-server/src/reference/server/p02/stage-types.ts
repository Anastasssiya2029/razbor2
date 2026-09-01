import type { P02Provider, P02ResultV1_3, P02RuleVersions, P01StrategyContext, TargetConfigProjection } from "./types";
import type { P02UpstreamSource } from "./projections";

export type StoredP02Result = {
  id: string;
  diagnosticId: string;
  analysisRunId: string;
  p01AnalysisResultId: string;
  targetArchetypeResultId: string;
  p01ResultHash: string;
  targetResultHash: string;
  promptVersion: "P-02.v1.3";
  outputSchemaVersion: "1.3";
  ruleVersions: P02RuleVersions;
  inputHash: string;
  strategyContext: P01StrategyContext;
  targetConfig: TargetConfigProjection;
  result: P02ResultV1_3 | null;
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
  failureCode: string | null;
  failureMessage: string | null;
};

export interface P02Repository {
  loadSource(analysisRunId: string): Promise<P02UpstreamSource | null>;
  loadResult(analysisRunId: string): Promise<StoredP02Result | null>;
  createResult(result: StoredP02Result): Promise<boolean>;
  replaceFailedResult?(result: StoredP02Result): Promise<boolean>;
  updateRun(analysisRunId: string, update: {
    status: "resolving_tasks" | "analysis_failed";
    errorCode: string | null;
    errorMessage: string | null;
    metadata: Record<string, unknown>;
    promptVersion: "P-02.v1.3";
  }): Promise<void>;
}

export type RunP02StageOptions = {
  repository?: P02Repository;
  provider?: P02Provider;
  now?: () => Date;
  createId?: () => string;
  retryFailed?: boolean;
};

export type P02StageExecutionResult = {
  analysisRunId: string;
  status: "resolving_tasks" | "analysis_failed";
  idempotentReplay: boolean;
  result: StoredP02Result;
};
