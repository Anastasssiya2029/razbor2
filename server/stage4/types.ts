import type { DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import type {
  BusinessArchetypeResult,
  TargetConfigurationInput,
  TargetConfigurationResult,
} from "@/server/7k";
import type { DesiredOwnerRole } from "@/server/7k/config/target-rules.v2.1";
import type { SevenKScores } from "@/server/7k/types";
import type { P01ResultV1_4 } from "@/server/p01/types";

export const TARGET_ARCHETYPE_STAGE_VERSION = "target-archetype-stage.v1" as const;

export type TargetArchetypeResourceVersions = {
  stageVersion: typeof TARGET_ARCHETYPE_STAGE_VERSION;
  p01PromptVersion: "P-01.v1.4";
  p01OutputSchemaVersion: "1.4";
  elements: "elements.v1";
  targetRules: "target-rules.v2.1";
  archetypes: "archetypes.v1";
};

export type Stage4Source = {
  analysisRunId: string;
  diagnosticId: string;
  runStatus: string;
  normalizedInput: DiagnosticInputV1_2;
  p01AnalysisResultId: string | null;
  p01PromptVersion: string | null;
  p01OutputSchemaVersion: string | null;
  p01InputHash: string | null;
  p01Result: P01ResultV1_4 | null;
  p01FailureCode: string | null;
  p01FailureMessage: string | null;
};

export type TargetInputAudit = {
  currentScoresSource: "p01.current7k";
  modelSource: "p01.targetIntent";
  capabilitiesSource: "p01.targetIntent.activatedCapabilities";
  desiredHoursSource: "p01.targetIntent.desiredSystemWeeklyHours";
  currentHoursSource: "diagnostic.current.weeklyHours";
  capabilityCodes: string[];
  targetModifierCodes: string[];
  desiredOwnerRole: DesiredOwnerRole | null;
  desiredOwnerRoleDerivedFrom: string | null;
};

export type TargetArchetypeComputation = {
  currentScores: SevenKScores;
  targetInput: TargetConfigurationInput;
  targetInputAudit: TargetInputAudit;
  target: TargetConfigurationResult;
  archetype: BusinessArchetypeResult;
  resourceVersions: TargetArchetypeResourceVersions;
};

export type StoredTargetArchetypeResult = {
  id: string;
  diagnosticId: string;
  analysisRunId: string;
  p01AnalysisResultId: string | null;
  p01InputHash: string | null;
  p01ResultHash: string | null;
  currentScores: SevenKScores | null;
  targetInput: TargetConfigurationInput | null;
  target: TargetConfigurationResult | null;
  archetype: BusinessArchetypeResult | null;
  resourceVersions: TargetArchetypeResourceVersions;
  deterministicInputHash: string;
  startedAt: string;
  completedAt: string;
  failureCode: string | null;
  failureMessage: string | null;
};

export type Stage4ExecutionResult = {
  analysisRunId: string;
  status: "strategizing" | "analysis_failed";
  idempotentReplay: boolean;
  result: StoredTargetArchetypeResult;
};

export interface TargetArchetypeRepository {
  loadSource(analysisRunId: string): Promise<Stage4Source | null>;
  loadResult(analysisRunId: string): Promise<StoredTargetArchetypeResult | null>;
  createResult(result: StoredTargetArchetypeResult): Promise<boolean>;
  updateRun(
    analysisRunId: string,
    update: {
      status: "strategizing" | "analysis_failed";
      errorCode: string | null;
      errorMessage: string | null;
      methodologyMetadata: Record<string, unknown>;
    },
  ): Promise<void>;
}
