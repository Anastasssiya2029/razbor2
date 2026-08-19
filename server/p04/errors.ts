export type P04ErrorKind =
  | "upstream_blocked"
  | "validation"
  | "integrity"
  | "technical"
  | "version_conflict";

export class P04Error extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly kind: P04ErrorKind,
    readonly details: unknown = null,
    options: { cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "P04Error";
  }
}

export function asP04Error(error: unknown): P04Error {
  if (error instanceof P04Error) return error;
  return new P04Error(
    "P04_TECHNICAL_ERROR",
    error instanceof Error ? error.message : "P-04 failed unexpectedly.",
    "technical",
    null,
    { cause: error },
  );
}
