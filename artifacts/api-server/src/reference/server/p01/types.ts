import type { DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import type { BaseModelFamily, ModelFamily } from "@/server/7k/config/target-rules.v2.2";
import type { MoneyNowScenarioId } from "@/server/7k/config/money-now.v2.2";
import type {
  MoneyNowFactCode,
  MoneyNowFactConfidence,
  MoneyNowFactState,
  MoneyNowMaterialConditionCode,
} from "@/server/7k/config/money-now-fact-extraction.v1";
import type { SevenKElementId } from "@/server/7k/types";

export const P01_OUTPUT_SCHEMA_VERSION = "1.4" as const;

export type P01AnalysisStatus =
  | "ok"
  | "low_confidence"
  | "blocked_by_insufficient_data"
  | "blocked_by_inconsistency";

export type P01Confidence = "high" | "medium" | "low";
export type P01EvidenceType =
  | "metric_result"
  | "repeated_current"
  | "current_example"
  | "documented_model"
  | "self_report"
  | "plan_or_idea";
export type P01TimeScope =
  | "current"
  | "historical_repeatable"
  | "historical_only"
  | "hypothesis";

export type P01Evidence = {
  id: string;
  source_field: string;
  fact: string;
  evidence_type: P01EvidenceType;
  time_scope: P01TimeScope;
  valence: "positive" | "negative" | "neutral";
  elements: SevenKElementId[];
  derived_from: string[];
};

export type P01ElementScore = {
  score: number | null;
  confidence: P01Confidence;
  evidence_cap: number | null;
  cap_reason: string | null;
  matched_level_rule_id: string | null;
  next_level_rule_id: string | null;
  evidence_ids: string[];
  counterevidence_ids: string[];
  why_not_higher: string | null;
  contradiction: string | null;
  historical_asset: string | null;
  missing_evidence: string[];
};

export type P01BusinessMap = {
  economics: string;
  products: string;
  audienceResult: string;
  acquisition: string;
  sales: string;
  assets: string;
  operations: string;
  uniqueness: string;
  experience: {
    strugglesSummary: string | null;
    bestPeriodSummary: string | null;
    failuresSummary: string | null;
    attempts: Array<{
      attempt: string;
      actual_result: string | null;
      client_explanation: string | null;
      time_scope: "current" | "historical_repeatable" | "historical_only";
      evidence_ids: string[];
    }>;
  };
  capacity: string;
};

export type P01MoneyChainFact = {
  stage:
    | "opportunities"
    | "interest"
    | "next_step"
    | "offer"
    | "payment"
    | "continuation"
    | "referral"
    | "capacity";
  summary: string;
  value: number | null;
  denominator: number | null;
  conversionPct: number | null;
  period: string | null;
  evidence_ids: string[];
};

export type P01MoneyNowSignal = {
  signal_code:
    | "CURRENT_CLIENTS"
    | "FORMER_CLIENTS"
    | "WARM_LEADS"
    | "SOCIAL_AUDIENCE"
    | "PARTNERS"
    | "REFERRAL_ASSET"
    | "PROVEN_HISTORICAL_MECHANISM"
    | "PROVEN_CURRENT_CHANNEL"
    | "UNUSED_CAPACITY"
    | "REPEAT_PURCHASES"
    | "CONTINUATION_GAP"
    | "KNOWN_CONVERSION_LEAK"
    | "PRICE_CHECK_SIGNAL"
    | "PAID_TRAFFIC_PROVEN";
  present: boolean;
  summary: string;
  confidence: P01Confidence;
  evidence_ids: string[];
};

export type P01MoneyNowHistoryItem = {
  history_status:
    | "not_reported"
    | "worked_sustained"
    | "worked_temporarily"
    | "tried_no_sustained_result"
    | "unclear";
  new_material_condition: "yes" | "no" | "unknown" | "not_applicable";
  condition_codes: MoneyNowMaterialConditionCode[];
  summary: string | null;
  evidence_ids: string[];
  new_condition_evidence_ids: string[];
  confidence: P01Confidence;
};

export type P01MoneyNowFact = {
  state: MoneyNowFactState;
  confidence: MoneyNowFactConfidence;
  summary: string | null;
  evidence_ids: string[];
};

export type P01MoneyNowFacts = Record<MoneyNowFactCode, P01MoneyNowFact>;

export type P01ResultV1_4_2 = {
  promptVersion: "P-01.v1.4.2";
  schemaVersion: typeof P01_OUTPUT_SCHEMA_VERSION;
  analysisStatus: P01AnalysisStatus;
  evidenceLedger: P01Evidence[];
  current7k: Record<SevenKElementId, P01ElementScore>;
  businessMap: P01BusinessMap;
  moneyChainFacts: P01MoneyChainFact[];
  moneyNowSignals: P01MoneyNowSignal[];
  moneyNowFacts: P01MoneyNowFacts;
  moneyNowHistory: Record<MoneyNowScenarioId, P01MoneyNowHistoryItem>;
  targetIntent: {
    rawBusinessModel: string | null;
    normalizedModelFamily: ModelFamily | null;
    primaryModelFamily: BaseModelFamily | null;
    secondaryModelFamilies: BaseModelFamily[];
    activatedCapabilities: Array<{
      code: string;
      reason: string;
      source_fields: string[];
    }>;
    desiredRoleSummary: string | null;
    desiredSystemWeeklyHours: number | null;
    confidence: P01Confidence;
    missing_evidence: string[];
  };
  sanityChecks: Array<{
    code: string;
    severity: "warning" | "error";
    message: string;
    evidence_ids: string[];
  }>;
};

/** Read-only shape for already persisted historical P-01 v1.4 snapshots. */
export type P01ResultV1_4 = Omit<P01ResultV1_4_2, "promptVersion"> & {
  promptVersion: "P-01.v1.4";
};

/** Read-only shape for already persisted historical P-01 v1.3 snapshots. */
export type P01ResultV1_3 = Omit<
  P01ResultV1_4_2,
  "promptVersion" | "schemaVersion" | "moneyNowFacts"
> & {
  promptVersion: "P-01.v1.3";
  schemaVersion: "1.3";
};

export type P01RuleVersions = {
  requestBuilder: "p01-request-builder.v2.4";
  scoringRules: "scoring-rules.v3.5";
  evidenceRouting: "evidence-routing.v3.1";
  targetModelDictionary: "target-model-dictionary.v2.2";
  moneyNowHistoryMap: "money-now-history-map.v2.2";
  moneyNowFactExtraction: "money-now-fact-extraction.v1";
};

export type P01ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
};

export type P01ProviderRequest = {
  systemPrompt: string;
  outputSchema: Record<string, unknown>;
  correction: string | null;
  /** Stable name for the concrete structured-output contract sent in this call. */
  schemaName?: string;
};

export type P01ProviderResponse = {
  text: string;
  rawResponse: unknown;
  usage: P01ProviderUsage;
};

export interface P01Provider {
  readonly provider: string;
  readonly model: string;
  complete(request: P01ProviderRequest): Promise<P01ProviderResponse>;
}

export type P01RunMetadata = {
  provider: string;
  model: string;
  promptVersion: "P-01.v1.4.2";
  outputSchemaVersion: typeof P01_OUTPUT_SCHEMA_VERSION;
  ruleVersions: P01RuleVersions;
  inputHash: string;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  retryCount: number;
  technicalRetryCount: number;
  reevaluationRetryCount: number;
  usage: P01ProviderUsage;
};

export type P01RunOutcome =
  | {
      kind: "success";
      result: P01ResultV1_4_2;
      metadata: P01RunMetadata;
      providerRawResponse: unknown;
    }
  | {
      kind: "blocked";
      result: P01ResultV1_4_2;
      failureCode: "P01_BLOCKED_INSUFFICIENT_DATA" | "P01_BLOCKED_INCONSISTENCY";
      failureMessage: string;
      metadata: P01RunMetadata;
      providerRawResponse: unknown;
    };

export type RunP01Options = {
  provider?: P01Provider;
  now?: () => Date;
  hashInput?: (input: DiagnosticInputV1_2) => Promise<string>;
  moneyNowEnabled?: boolean;
};
