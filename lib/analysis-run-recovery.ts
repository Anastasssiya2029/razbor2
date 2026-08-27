export type FailedRunRecovery = "retry_strategy" | "start_fresh";

export function failedRunRecovery(errorCode: string | null | undefined): FailedRunRecovery {
  if (
    errorCode?.startsWith("P02_")
    && errorCode !== "P02_NO_ACTIONABLE_TARGET_GAP"
  ) {
    return "retry_strategy";
  }
  if (errorCode?.startsWith("P04_")) return "retry_strategy";
  return "start_fresh";
}
