export type Stage4FailureKind = "upstream_blocked" | "validation" | "technical" | "version_conflict";

export class Stage4Error extends Error {
  readonly code: string;
  readonly kind: Stage4FailureKind;
  readonly details: unknown;

  constructor(code: string, message: string, kind: Stage4FailureKind, details: unknown = null) {
    super(message);
    this.name = "Stage4Error";
    this.code = code;
    this.kind = kind;
    this.details = details;
  }
}

export function asStage4Error(error: unknown): Stage4Error {
  if (error instanceof Stage4Error) return error;
  const message = error instanceof Error ? error.message : "Unexpected Target/Archetype failure";
  return new Stage4Error("STAGE4_TECHNICAL_ERROR", message, "technical");
}

