import type { ManagerPlanVersion } from "@/lib/analysis-checklist";

export class ManagerPlanError extends Error {
  constructor(
    readonly code: "MANAGER_PLAN_INVALID" | "MANAGER_PLAN_SOURCE_CHANGED",
    readonly status: 400 | 409,
    message: string,
  ) {
    super(message);
    this.name = "ManagerPlanError";
  }
}

export type SaveManagerPlanInput = {
  analysisRunId: string;
  actorUserId: string;
  sourceResultHash: string;
  content: unknown;
};

export type { ManagerPlanVersion };
