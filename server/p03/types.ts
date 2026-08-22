import type { AiProviderUsage } from "@/server/ai/openrouter-json";
import type {
  MoneyNowInterventionCode,
  MoneyNowPrescriptionCauseCode,
} from "@/server/7k/config/money-now-prescription-rules.v1";
import type { MoneyNowScenarioId } from "@/server/7k/config/money-now.v2.2";
import type { SevenKElementId } from "@/server/7k/types";
import type { MoneyNowCandidateTrace } from "@/server/7k/money-now-selector";
import type {
  P01BusinessMap,
  P01ElementScore,
  P01Evidence,
  P01MoneyChainFact,
  P01MoneyNowFact,
  P01MoneyNowHistoryItem,
} from "@/server/p01/types";

export const P03_STAGE_VERSION = "p03-money-now-prescription-stage.v1" as const;
export const P03_OUTPUT_SCHEMA_VERSION = "1.5" as const;
export const P03_LOCKED_TEASER_VERSION = "money-now-locked-teaser.v1" as const;
export const P03_LOCKED_TEASER =
  "Мы нашли ближайший денежный сценарий, который опирается на уже существующий у вас актив и не требует запуска нового большого канала. Полная связка, бизнес-рецепт и 30-дневный тест доступны в полной карте." as const;

export type P03AnalysisStatus =
  | "ok"
  | "low_confidence"
  | "blocked_by_inconsistency"
  | "blocked_by_insufficient_evidence";

export type P03SelectedScenarioProjection = {
  scenario_id: MoneyNowScenarioId;
  scenario_title: string;
  money_distance: string;
  proximity_rank: number;
  proof_level: 1 | 2 | 3;
  capacity_fit: "fit" | "risk";
  model_fit: "fit";
  signal_speed_rank: 1 | 2 | 3 | 4;
  complexity: "low" | "medium" | "high";
  evidence_ids: string[];
};

export type P03Context = {
  evidenceLedger: P01Evidence[];
  current7k: Record<SevenKElementId, P01ElementScore>;
  businessMap: P01BusinessMap;
  moneyChainFacts: P01MoneyChainFact[];
  selectedScenarioFacts: Record<string, P01MoneyNowFact>;
  selectedScenarioHistory: P01MoneyNowHistoryItem;
  selectedCandidateTrace: MoneyNowCandidateTrace;
};

export type BackendMetric = {
  metric_code: string;
  role: "baseline" | "target" | "reference";
  value: number;
  unit: string | null;
  source: "client_fact" | "derived_client_fact";
  evidence_ids: string[];
};

export type BackendRevenueScenario = {
  description: string;
  formula: string;
  result_rub: number | null;
  assumptions: string[];
  is_forecast: false;
};

export type InterventionHistoryReview = {
  intervention_code: MoneyNowInterventionCode;
  match_status: "not_reported" | "no_match" | "matched" | "unclear";
  matched_attempt_evidence_ids: string[];
  new_condition_status: "not_applicable" | "confirmed" | "not_confirmed" | "unknown";
  new_condition_evidence_ids: string[];
  conclusion:
    | "clear_to_test"
    | "blocked_repeat_without_new_condition"
    | "blocked_insufficient_history_evidence";
};

export type P03ResultV1_5 = {
  promptVersion: "P-03.v1.5";
  schemaVersion: "1.5";
  analysisStatus: P03AnalysisStatus;
  selectedScenario: {
    scenario_id: MoneyNowScenarioId;
    scenario_title: string;
  };
  diagnosis: {
    observed_fact: string;
    money_leak: string;
    primary_cause_code: MoneyNowPrescriptionCauseCode | null;
    cause_statement: string | null;
    contributing_cause_codes: MoneyNowPrescriptionCauseCode[];
    evidence_ids: string[];
    counterevidence_ids: string[];
    confidence: "high" | "medium" | "low";
    missing_evidence: string[];
  };
  businessPrescription: null | {
    client_task_title: string;
    coach_explanation: string;
    precondition: string | null;
    interventions: Array<{
      intervention_code: MoneyNowInterventionCode;
      personalized_action: string;
      why_needed: string;
    }>;
    expected_change: string;
    do_not_scale_yet: string[];
    zero_step: null | {
      duration_days: number;
      task: string;
      market_action: string;
      evidence_ids: string[];
    };
  };
  interventionHistoryReview: InterventionHistoryReview[];
  targetMetric: null | {
    metric_name: string;
    baseline_metric_code: string | null;
    baseline_value: number | null;
    target_metric_code: string | null;
    target_value: number | null;
    unit: string | null;
    target_rule: string;
    source: "client_fact" | "derived_from_client_facts" | "backend_metric" | "qualitative_rule";
    assumptions: string[];
    evidence_ids: string[];
  };
  test30d: null | {
    audience: string;
    offer: string;
    asset: string;
    path: string;
    actions: Array<{ intervention_code: MoneyNowInterventionCode; action: string }>;
    repetitions: number | null;
    primary_metric: string;
    baseline: number | null;
    target_signal: string;
    review_day: number;
    decision_rule: string;
  };
  revenueScenario: BackendRevenueScenario | null;
  supportingElements: Array<{
    element_id: SevenKElementId;
    minimal_change: string;
    why_needed: string;
  }>;
  lockedTeaser: string;
  sanityChecks: Array<{
    code: string;
    severity: "warning" | "error";
    message: string;
    evidence_ids: string[];
  }>;
};

export type P03RuleVersions = {
  selectorContract: "money-now-selector-contract.v1.2";
  selectorMethodology: "money-now.v2.2";
  prescriptionMethodology: "money-now.v2.3";
  prescriptionRules: "money-now-prescription-rules.v1";
  factExtraction: "money-now-fact-extraction.v1";
  promptSha256: string;
};

export type P03ProviderRequest = {
  systemPrompt: string;
  outputSchema: Record<string, unknown>;
  correction: string | null;
};

export type P03ProviderResponse = {
  text: string;
  rawResponse: unknown;
  usage: AiProviderUsage;
};

export interface P03Provider {
  readonly provider: string;
  readonly model: string;
  complete(request: P03ProviderRequest): Promise<P03ProviderResponse>;
}

export type P03RunMetadata = {
  provider: string;
  model: string;
  promptVersion: "P-03.v1.5";
  outputSchemaVersion: "1.5";
  ruleVersions: P03RuleVersions;
  inputHash: string;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  retryCount: number;
  technicalRetryCount: number;
  reevaluationRetryCount: number;
  usage: AiProviderUsage;
};

export type P03RunOutcome = {
  result: P03ResultV1_5;
  metadata: P03RunMetadata;
  providerRawResponse: unknown;
};
