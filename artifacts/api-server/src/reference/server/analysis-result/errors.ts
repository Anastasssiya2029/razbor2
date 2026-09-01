export type AnalysisResultErrorKind =
  | "not_found"
  | "not_ready"
  | "validation"
  | "integrity"
  | "version_conflict";

export class AnalysisResultError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly kind: AnalysisResultErrorKind,
  ) {
    super(message);
    this.name = "AnalysisResultError";
  }
}
