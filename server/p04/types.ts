import type { AiProviderUsage } from "@/server/ai/openrouter-json";
import type { BusinessArchetypeResult } from "@/server/7k";
import type { SevenKElementId, SevenKScores } from "@/server/7k/types";
import type { P01BusinessMap, P01ElementScore, P01Evidence } from "@/server/p01/types";
import type { P02ResultV1_3, TargetConfigProjection } from "@/server/p02/types";
import type { P03ResultV1_5 } from "@/server/p03/types";
import type { ResolvedTransitionPlan } from "@/server/task-resolver/types";

export const P04_STAGE_VERSION = "p04-report-writer-stage.v1" as const;
export const P04_OUTPUT_SCHEMA_VERSION = "1.2" as const;
export const P04_REPORT_POLICY_VERSION = "p04-report-policy.v1" as const;
export const P04_SOURCE_REGISTRY_VERSION = "p04-source-registry.v1" as const;

export type P04MoneyNowStatus =
  | "available"
  | "no_eligible_scenario"
  | "blocked_insufficient_evidence"
  | "blocked_inconsistency";

export type P04Context = {
  current: {
    analysisStatus: "ok" | "low_confidence";
    evidenceLedger: P01Evidence[];
    current7k: Record<SevenKElementId, P01ElementScore>;
    businessMap: P01BusinessMap;
  };
  target: TargetConfigProjection;
  archetype: BusinessArchetypeResult;
  strategy: Pick<
    P02ResultV1_3,
    | "constraint"
    | "bundle"
    | "elementSequence"
    | "businessValidation"
    | "perceivedVsEvidenced"
    | "previousAttemptsAnalysis"
  > & { analysisStatus: "ok" | "low_confidence" };
  resolvedPlan: ResolvedTransitionPlan;
  moneyNow: {
    selectionStatus: "selected" | "no_eligible_scenario";
    selectedScenario: null | {
      scenario_id: string;
      scenario_title: string;
      money_distance: string;
      proximity_rank: number;
      proof_level: number;
      capacity_fit: "fit" | "risk";
      model_fit: "fit";
      signal_speed_rank: number;
      complexity: "low" | "medium" | "high";
      evidence_ids: string[];
    };
    p03OutcomeStatus:
      | P03ResultV1_5["analysisStatus"]
      | "skipped_no_eligible_scenario";
    p03Result: P03ResultV1_5 | null;
    lockedTeaser: string;
  };
  clientContext: {
    expertName: string | null;
    niche: string | null;
  };
};

export type P04WhyNotNowExpected = {
  element_id: SevenKElementId;
  status: "maintain" | "later";
  return_trigger: string | null;
};

export type P04RouteCardIdentity = {
  card_id: string;
  order: number;
  element_id: SevenKElementId;
  role: "priority" | "build";
  from_score: number;
  to_score: number;
  task_ids: string[];
};

export type P04ReportPolicy = {
  version: typeof P04_REPORT_POLICY_VERSION;
  analysisStatus: "ok" | "low_confidence";
  moneyNowStatus: P04MoneyNowStatus;
  firstTask: {
    taskId: string;
    task: string;
  };
  validationSignal: string;
  targetShiftElements: Array<{
    element_id: SevenKElementId;
    from_score: number;
    to_score: number;
  }>;
  whyNotNowExpected: P04WhyNotNowExpected[];
  routeCardIdentities: P04RouteCardIdentity[];
};

export type P04SourceRegistry = {
  version: typeof P04_SOURCE_REGISTRY_VERSION;
  refs: string[];
};

export type P04ResultV1_2 = {
  promptVersion: "P-04.v1.2";
  schemaVersion: "1.2";
  analysisStatus: "ok" | "low_confidence" | "blocked_by_inconsistency";
  opening: { headline: string; summary: string; source_refs: string[] };
  currentConfiguration: {
    summary: string;
    strengths: string[];
    fragilities: string[];
    source_refs: string[];
  };
  targetConfiguration: {
    summary: string;
    key_shifts: Array<{
      element_id: SevenKElementId;
      from_score: number;
      to_score: number;
      shift: string;
      source_refs: string[];
    }>;
    source_refs: string[];
  };
  archetype: {
    archetype_name: string;
    summary: string;
    source_refs: string[];
  };
  growthPoint: {
    priority_element: SevenKElementId | null;
    build_elements: SevenKElementId[];
    title: string;
    coach_explanation: string;
    what_it_unlocks: string[];
    source_refs: string[];
  };
  whyNotNow: Array<{
    element_id: SevenKElementId;
    status: "maintain" | "later";
    text: string;
    return_trigger: string | null;
    source_refs: string[];
  }>;
  routeCards: Array<P04RouteCardIdentity & {
    card_title: string;
    why_now: string;
    what_changes_in_business: string;
    connection_to_next_stage: string | null;
    source_refs: string[];
  }>;
  businessValidation: {
    checkpoint_after_order: number;
    metric_name: string;
    baseline_value: number | null;
    target_value: number | null;
    unit: string | null;
    target_rule: string;
    formula: string | null;
    timeframe_days: number | null;
    if_signal_absent: string;
    explanation: string;
    source_refs: string[];
  };
  moneyNow: {
    status: P04MoneyNowStatus;
    scenario_id: string | null;
    headline: string;
    narrative: string | null;
    locked_teaser: string;
    source_refs: string[];
  };
  finalFocus: {
    headline: string;
    text: string;
    first_task_id: string;
    first_action: string;
    wait_for_signal: string;
    source_refs: string[];
  };
  sanityChecks: Array<{
    code: string;
    severity: "warning" | "error";
    message: string;
    source_refs: string[];
  }>;
};

export type P04RuleVersions = {
  requestBuilder: "p04-request-builder.v2";
  p01Prompt: "P-01.v1.4.2";
  p01Schema: "1.4";
  targetStage: "target-archetype-stage.v1";
  targetRules: "target-rules.v2.2";
  archetypes: "archetypes.v2";
  p02Prompt: "P-02.v1.3";
  p02Schema: "1.3";
  taskResolver: "task-resolver-stage.v1";
  transitions: "transitions-70.v2";
  moneyNowSelector: "money-now-selector-stage.v1";
  moneyNowSelectorContract: "money-now-selector-contract.v1.2";
  p03Prompt: "P-03.v1.5";
  p03Schema: "1.5";
  reportPolicy: typeof P04_REPORT_POLICY_VERSION;
  sourceRegistry: typeof P04_SOURCE_REGISTRY_VERSION;
  reportGlossary: "report-glossary.v1.1";
  promptSha256: string;
};

export type P04ProviderRequest = {
  systemPrompt: string;
  outputSchema: Record<string, unknown>;
  correction: string | null;
};

export type P04ProviderResponse = {
  text: string;
  rawResponse: unknown;
  usage: AiProviderUsage;
};

export interface P04Provider {
  readonly provider: string;
  readonly model: string;
  complete(request: P04ProviderRequest): Promise<P04ProviderResponse>;
}

export type P04AttemptDiagnostic = {
  attempt: number;
  kind: "transport" | "malformed_json" | "schema" | "semantic";
  issues: Array<{
    path: string;
    code: string;
  }>;
};

export type P04RunMetadata = {
  provider: string;
  model: string;
  promptVersion: "P-04.v1.2";
  outputSchemaVersion: "1.2";
  ruleVersions: P04RuleVersions;
  inputHash: string;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  retryCount: number;
  technicalRetryCount: number;
  reevaluationRetryCount: number;
  attemptDiagnostics: P04AttemptDiagnostic[];
  usage: AiProviderUsage;
};

export type P04RunOutcome = {
  result: P04ResultV1_2;
  metadata: P04RunMetadata;
  providerRawResponse: unknown;
};

export type P04UpstreamHashes = {
  p01ResultHash: string;
  targetArchetypeResultHash: string;
  p02ResultHash: string;
  resolvedTransitionPlanHash: string;
  moneyNowSelectionHash: string;
  p03ResultHash: string;
};

export type P04CurrentScores = SevenKScores;
