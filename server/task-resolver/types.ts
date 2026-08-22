import type { SevenKElementId, SevenKScores } from "@/server/7k/types";
import type { P01ResultV1_4_2 } from "@/server/p01/types";
import type { StoredP02Result } from "@/server/p02/stage-types";
import type { P02ResultV1_3 } from "@/server/p02/types";
import type { StoredTargetArchetypeResult } from "@/server/stage4/types";

export const TASK_RESOLVER_STAGE_VERSION = "task-resolver-stage.v1" as const;

export type ResolvedTransitionTask = {
  taskId: string;
  fromScore: number;
  toScore: number;
  task: string;
  doneWhen: string;
  transitionVersion: string;
};

export type ResolvedTransitionCard = {
  cardId: string;
  order: number;
  elementId: SevenKElementId;
  role: "priority" | "build";
  fromScore: number;
  toScore: number;
  tasks: ResolvedTransitionTask[];
  p02WhyNow: string;
  p02Unlocks: string[];
  evidenceIds: string[];
};

export type ResolvedTransitionPlan = {
  stageVersion: typeof TASK_RESOLVER_STAGE_VERSION;
  transitionRegistryVersion: "transitions-70.v1";
  cards: ResolvedTransitionCard[];
  taskIds: string[];
  totalTasks: number;
  businessValidation: P02ResultV1_3["businessValidation"];
};

export type TaskResolverPlanInput = {
  elementSequence: P02ResultV1_3["elementSequence"];
  businessValidation: P02ResultV1_3["businessValidation"];
  currentScores: SevenKScores;
  targetScores: SevenKScores;
};

export type TaskResolverSource = {
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
  targetStage: Pick<
    StoredTargetArchetypeResult,
    | "id"
    | "p01AnalysisResultId"
    | "p01InputHash"
    | "p01ResultHash"
    | "currentScores"
    | "target"
    | "resourceVersions"
    | "deterministicInputHash"
    | "failureCode"
    | "failureMessage"
  > | null;
  p02: StoredP02Result | null;
};

export type PreparedTaskResolverInput = {
  planInput: TaskResolverPlanInput;
  p01AnalysisResultId: string;
  targetArchetypeResultId: string;
  p02AnalysisResultId: string;
  p02ResultHash: string;
  targetResultHash: string;
  deterministicInputHash: string;
};

export type StoredResolvedTransitionPlan = {
  id: string;
  diagnosticId: string;
  analysisRunId: string;
  p01AnalysisResultId: string | null;
  targetArchetypeResultId: string | null;
  p02AnalysisResultId: string | null;
  p02ResultHash: string | null;
  targetResultHash: string | null;
  stageVersion: typeof TASK_RESOLVER_STAGE_VERSION;
  transitionRegistryVersion: "transitions-70.v1";
  deterministicInputHash: string;
  plan: ResolvedTransitionPlan | null;
  startedAt: string;
  completedAt: string;
  failureCode: string | null;
  failureMessage: string | null;
};

export interface TaskResolverRepository {
  loadSource(analysisRunId: string): Promise<TaskResolverSource | null>;
  loadResult(analysisRunId: string): Promise<StoredResolvedTransitionPlan | null>;
  createResult(result: StoredResolvedTransitionPlan): Promise<boolean>;
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

export type TaskResolverExecutionResult = {
  analysisRunId: string;
  status: "money_now" | "analysis_failed";
  idempotentReplay: boolean;
  result: StoredResolvedTransitionPlan;
};
