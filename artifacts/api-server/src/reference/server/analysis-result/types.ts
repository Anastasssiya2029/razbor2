import type { SevenKElementId, SevenKScores } from "@/server/7k/types";
import type { P01BusinessMap, P01ElementScore } from "@/server/p01/types";
import type { P02ResultV1_3, TargetConfigProjection } from "@/server/p02/types";
import type { P03ResultV1_5 } from "@/server/p03/types";
import type { P04ResultV1_2, P04MoneyNowStatus } from "@/server/p04/types";
import type { BusinessArchetypeResult } from "@/server/7k";
import type { ResolvedTransitionPlan } from "@/server/task-resolver/types";
import type { P03SkippedOutcome } from "@/server/p03/stage-types";
import type { P04UpstreamHashes } from "@/server/p04/types";

export const ANALYSIS_RESULT_VERSION = "analysis-result.v1" as const;
export const ANALYSIS_RESULT_METHODOLOGY_VERSION = "7k.v1.2" as const;
export const ANALYSIS_RESULT_ASSEMBLER_VERSION = "analysis-result-assembler.v1" as const;

export const ANALYSIS_RESULT_VERSIONS = {
  diagnosticInput: "1.2",
  p01Prompt: "P-01.v1.4.2",
  p01Schema: "1.4",
  targetStage: "target-archetype-stage.v1",
  targetRules: "target-rules.v2.3",
  archetypes: "archetypes.v2",
  p02Prompt: "P-02.v1.3",
  p02Schema: "1.3",
  taskResolver: "task-resolver-stage.v1",
  transitions: "transitions-70.v2",
  moneyNowSelector: "money-now-selector-stage.v1",
  moneyNowSelectorContract: "money-now-selector-contract.v1.2",
  moneyNowSelectorMethodology: "money-now.v2.2",
  moneyNowPrescriptionMethodology: "money-now.v2.3",
  p03Prompt: "P-03.v1.5",
  p03Schema: "1.5",
  p04Prompt: "P-04.v1.3",
  p04Schema: "1.3",
  analysisResult: ANALYSIS_RESULT_VERSION,
  assembler: ANALYSIS_RESULT_ASSEMBLER_VERSION,
} as const;

export type AnalysisResultVersions = typeof ANALYSIS_RESULT_VERSIONS;

export type AnalysisResultV1 = {
  version: typeof ANALYSIS_RESULT_VERSION;
  methodologyVersion: typeof ANALYSIS_RESULT_METHODOLOGY_VERSION;
  analysisRunId: string;
  diagnosticId: string;
  analysisStatus: "ok" | "low_confidence";
  versions: AnalysisResultVersions;
  clientContext: {
    expertName: string | null;
    niche: string | null;
  };
  current: {
    scores: SevenKScores;
    current7k: Record<SevenKElementId, P01ElementScore>;
    businessMap: P01BusinessMap;
  };
  target: TargetConfigProjection;
  archetype: BusinessArchetypeResult;
  strategy: {
    constraint: P02ResultV1_3["constraint"];
    perceivedVsEvidenced: P02ResultV1_3["perceivedVsEvidenced"];
    previousAttemptsAnalysis: P02ResultV1_3["previousAttemptsAnalysis"];
    bundle: P02ResultV1_3["bundle"];
    elementSequence: P02ResultV1_3["elementSequence"];
    businessValidation: P02ResultV1_3["businessValidation"];
  };
  route: ResolvedTransitionPlan;
  moneyNow: {
    status: P04MoneyNowStatus;
    selectionStatus: "selected" | "no_eligible_scenario";
    selectedScenario: {
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
    } | null;
    prescription: P03ResultV1_5 | null;
    skippedOutcome: P03SkippedOutcome | null;
    narrative: P04ResultV1_2["moneyNow"];
  };
  report: P04ResultV1_2;
  finalFocus: P04ResultV1_2["finalFocus"];
  provenance: {
    upstreamIds: {
      p01AnalysisResultId: string;
      targetArchetypeResultId: string;
      p02AnalysisResultId: string;
      resolvedTransitionPlanId: string;
      moneyNowSelectionId: string;
      p03PrescriptionResultId: string;
      p04ReportResultId: string;
    };
    upstreamHashes: P04UpstreamHashes;
    p04DeterministicInputHash: string;
    assemblyInputHash: string;
  };
};

export type AnalysisResultSource = {
  analysisRunId: string;
  diagnosticId: string;
  runStatus: string;
  p03: import("@/server/p03/stage-types").StoredP03Result | null;
  p04: import("@/server/p04/stage-types").StoredP04Result | null;
};

export type StoredAnalysisResult = {
  id: string;
  diagnosticId: string;
  analysisRunId: string;
  schemaVersion: typeof ANALYSIS_RESULT_VERSION;
  methodologyVersion: typeof ANALYSIS_RESULT_METHODOLOGY_VERSION;
  result: AnalysisResultV1;
};

export interface AnalysisResultRepository {
  loadSource(analysisRunId: string): Promise<AnalysisResultSource | null>;
  loadResult(analysisRunId: string): Promise<StoredAnalysisResult | null>;
  createResult(result: StoredAnalysisResult): Promise<boolean>;
}

export type AssembleAnalysisResultOptions = {
  repository?: AnalysisResultRepository;
  createId?: () => string;
};

export type AnalysisResultExecution = {
  result: AnalysisResultV1;
  idempotentReplay: boolean;
};
