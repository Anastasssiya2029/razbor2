import type { TargetConfigurationResult } from "@/server/7k";
import type { SevenKElementId } from "@/server/7k/types";
import type { P01BusinessMap, P01ElementScore, P01Evidence, P01MoneyChainFact } from "@/server/p01/types";
import type { AiProviderUsage } from "@/server/ai/openrouter-json";

export const P02_OUTPUT_SCHEMA_VERSION = "1.3" as const;
export const P02_STAGE_VERSION = "p02-transition-strategist-stage.v1" as const;

export type P01StrategyContext = {
  evidenceLedger: P01Evidence[];
  current7k: Record<SevenKElementId, P01ElementScore>;
  businessMap: P01BusinessMap;
  moneyChainFacts: P01MoneyChainFact[];
  desiredRoleSummary: string | null;
  desiredSystemWeeklyHours: number | null;
};

export type TargetConfigProjection = Pick<
  TargetConfigurationResult,
  | "modelFamily"
  | "modelComponents"
  | "requiredMinimum"
  | "targetScores"
  | "gap"
  | "capabilities"
  | "appliedModifiers"
  | "desiredOwnerRole"
>;

export type P02ResultV1_3 = {
  promptVersion: "P-02.v1.3";
  schemaVersion: "1.3";
  analysisStatus: "ok" | "low_confidence" | "blocked_by_inconsistency";
  constraint: {
    symptom: string;
    functional_bottleneck: string;
    constraint_stage: string;
    constraint_type: string;
    root_cause: string;
    root_evidence_ids: string[];
    counterevidence_ids: string[];
    confidence: "high" | "medium" | "low";
    missing_evidence: string[];
  };
  perceivedVsEvidenced: {
    client_hypothesis: string | null;
    evidenced_bottleneck: string;
    relation: "matches" | "partially_matches" | "differs" | "insufficient_data";
    explanation: string;
    evidence_ids: string[];
  };
  previousAttemptsAnalysis: null | {
    attempts_summary: string[];
    repeated_break_pattern: string | null;
    why_not_stable: string;
    route_difference: string;
    confidence: "high" | "medium" | "low";
    evidence_ids: string[];
  };
  candidateAudit: Array<{
    element_id: SevenKElementId;
    hypothesis: string;
    supporting_evidence_ids: string[];
    counterevidence_ids: string[];
    dependency_position: string;
    target_necessity: string;
    decision: "selected" | "rejected";
    rejection_reason: string | null;
    tie_break_step: number | null;
  }>;
  bundle: {
    priority_element: SevenKElementId | null;
    build_elements: SevenKElementId[];
    maintain_elements: SevenKElementId[];
    later_elements: Array<{ element_id: SevenKElementId; reason: string; return_trigger: string }>;
    why_this_bundle: string;
    why_not_now: Array<{
      element_id: SevenKElementId;
      reason_code: string;
      reason: string;
      return_trigger: string | null;
    }>;
  };
  elementSequence: Array<{
    order: number;
    element_id: SevenKElementId;
    role: "priority" | "build";
    from_score: number;
    to_score: number;
    why_now: string;
    prerequisite_elements: SevenKElementId[];
    unlocks: string[];
    evidence_ids: string[];
  }>;
  businessValidation: {
    checkpoint_after_order: number;
    metric_name: string;
    baseline_value: number | null;
    target_value: number | null;
    unit: string | null;
    target_rule: string;
    formula: string | null;
    assumptions: string[];
    timeframe_days: number | null;
    if_signal_absent: string;
    evidence_ids: string[];
  };
  sanityChecks: Array<{
    code: string;
    severity: "warning" | "error";
    message: string;
    element_ids: SevenKElementId[];
    evidence_ids: string[];
  }>;
};

export type P02RuleVersions = {
  elements: "elements.v1";
  levelCapabilities: "scoring-rules.v2.0";
  constraintRules: "constraint-rules.v2.1";
  dependencyRules: "dependency-rules.v2.1";
  targetRules: "target-rules.v2.2";
};

export type P02ProviderRequest = {
  systemPrompt: string;
  outputSchema: Record<string, unknown>;
  correction: string | null;
};

export type P02ProviderResponse = { text: string; rawResponse: unknown; usage: AiProviderUsage };

export interface P02Provider {
  readonly provider: string;
  readonly model: string;
  complete(request: P02ProviderRequest): Promise<P02ProviderResponse>;
}

export type P02RunMetadata = {
  provider: string;
  model: string;
  promptVersion: "P-02.v1.3";
  outputSchemaVersion: "1.3";
  ruleVersions: P02RuleVersions;
  inputHash: string;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  retryCount: number;
  technicalRetryCount: number;
  reevaluationRetryCount: number;
  usage: AiProviderUsage;
};

export type P02RunOutcome =
  | { kind: "success"; result: P02ResultV1_3; metadata: P02RunMetadata; providerRawResponse: unknown }
  | {
      kind: "blocked";
      result: P02ResultV1_3;
      failureCode: "P02_BLOCKED_INCONSISTENCY";
      failureMessage: string;
      metadata: P02RunMetadata;
      providerRawResponse: unknown;
    };

