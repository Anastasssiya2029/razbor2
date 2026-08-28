export type TaskResolverFailureKind =
  | "upstream_blocked"
  | "validation"
  | "integrity"
  | "technical"
  | "version_conflict";

export class TaskResolverError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly kind: TaskResolverFailureKind,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = "TaskResolverError";
  }
}

export function asTaskResolverError(error: unknown): TaskResolverError {
  if (error instanceof TaskResolverError) return error;
  return new TaskResolverError(
    "TASK_RESOLVER_TECHNICAL_ERROR",
    error instanceof Error ? error.message : "Unexpected deterministic Task Resolver failure.",
    "technical",
  );
}
