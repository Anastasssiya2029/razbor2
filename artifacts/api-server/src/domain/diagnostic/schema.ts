// Diagnostic input contract — ported verbatim from the reference app's
// lib/diagnostic-input.ts (DiagnosticInput v1.2). Do not redesign this; the
// entire 7K/P01-P04 pipeline is contractually tied to this exact shape.
export {
  DIAGNOSTIC_SCHEMA_VERSION,
  METHODOLOGY_VERSION,
  FLAT_FORM_SCHEMA_VERSION,
  ANALYSIS_STATUSES,
  DiagnosticContractError,
  normalizeDiagnosticSubmission,
  validateDiagnosticInput,
  assertDiagnosticInputForAi,
  isAnalysisStatus,
} from "../../reference/lib/diagnostic-input";
export type {
  DiagnosticInputV1_2,
  DiagnosticContractIssue,
  NormalizedDiagnosticSubmission,
  AnalysisStatus,
  ClientsCountPeriod,
} from "../../reference/lib/diagnostic-input";
