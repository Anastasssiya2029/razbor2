export type P02FailureKind = "upstream_blocked" | "validation" | "technical" | "version_conflict";

export class P02Error extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly kind: P02FailureKind,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = "P02Error";
  }
}

export function asP02Error(error: unknown): P02Error {
  if (error instanceof P02Error) return error;
  return new P02Error(
    "P02_TECHNICAL_ERROR",
    error instanceof Error ? error.message : "Unexpected P-02 failure",
    "technical",
  );
}

