export type P03ErrorKind =
  | "upstream_blocked"
  | "validation"
  | "integrity"
  | "technical"
  | "version_conflict";

export class P03Error extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly kind: P03ErrorKind,
    readonly details: unknown = null,
    options: { cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "P03Error";
  }
}

export function asP03Error(error: unknown): P03Error {
  if (error instanceof P03Error) return error;
  return new P03Error(
    "P03_TECHNICAL_ERROR",
    error instanceof Error ? error.message : "P-03 failed unexpectedly.",
    "technical",
    null,
    { cause: error },
  );
}

