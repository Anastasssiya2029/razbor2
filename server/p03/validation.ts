import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import p03OutputSchema from "@/schemas/p03-money-now-prescription.output.v1.4.schema.json";
import {
  allowedInterventionsForCauses,
  derivePrescriptionSupportingElements,
  getMoneyNowScenarioPrescriptionRule,
  MONEY_NOW_PRESCRIPTION_REGISTRY,
  MONEY_NOW_SELECTABLE_INTERVENTION_CODES,
  type MoneyNowInterventionCode,
  type MoneyNowPrescriptionCauseCode,
} from "@/server/7k/config/money-now-prescription-rules.v1";
import type { P03SelectedPreparedInput } from "./projections";
import type { BackendMetric, P03ResultV1_4 } from "./types";

export type P03ValidationIssue = { path: string; code: string; message: string };

export class P03SchemaValidationError extends Error {
  readonly code = "P03_SCHEMA_VALIDATION_FAILED" as const;
  constructor(readonly issues: P03ValidationIssue[]) {
    super("P-03 output does not satisfy schema 1.4");
    this.name = "P03SchemaValidationError";
  }
}

export class P03InvariantError extends Error {
  readonly code = "P03_INVARIANT_FAILED" as const;
  constructor(readonly issues: P03ValidationIssue[]) {
    super("P-03 output violates backend semantic invariants");
    this.name = "P03InvariantError";
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(p03OutputSchema);
const SELECTABLE_INTERVENTIONS = new Set<string>(MONEY_NOW_SELECTABLE_INTERVENTION_CODES);

function schemaIssue(error: ErrorObject): P03ValidationIssue {
  return {
    path: error.instancePath || "/",
    code: `schema.${error.keyword}`,
    message: error.message ?? "Schema validation failed",
  };
}

export function validateP03Schema(value: unknown): P03ResultV1_4 {
  if (!validateSchema(value)) {
    throw new P03SchemaValidationError((validateSchema.errors ?? []).map(schemaIssue));
  }
  return value as P03ResultV1_4;
}

function add(issues: P03ValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function canonicalizeP03SupportingElements(result: P03ResultV1_4): P03ResultV1_4 {
  const normalized = structuredClone(result);
  const interventions = normalized.businessPrescription?.interventions ?? [];
  const codes = interventions
    .map((item) => item.intervention_code)
    .filter((code): code is MoneyNowInterventionCode => SELECTABLE_INTERVENTIONS.has(code));
  if (codes.length === 0) {
    normalized.supportingElements = [];
    return normalized;
  }
  const elements = derivePrescriptionSupportingElements(codes);
  if (elements.length > 3) {
    throw new P03InvariantError([{
      path: "/supportingElements",
      code: "supporting_elements_schema_limit",
      message: `Selected interventions derive ${elements.length} supporting elements; schema 1.4 allows at most 3. Select a smaller causal set without losing the primary anchor.`,
    }]);
  }
  normalized.supportingElements = elements.map((elementId) => {
    const definitions = codes
      .map((code) => MONEY_NOW_PRESCRIPTION_REGISTRY.interventions[code])
      .filter((definition) => definition.supportingElements.includes(elementId));
    return {
      element_id: elementId,
      minimal_change: truncate(definitions.map((definition) => definition.title).join(" → "), 500),
      why_needed: truncate(definitions.map((definition) => definition.description).join(" "), 700),
    };
  });
  return normalized;
}

function forbiddenLegacyIssues(value: unknown, path = ""): P03ValidationIssue[] {
  const issues: P03ValidationIssue[] = [];
  if (value === "products_method") {
    add(issues, path || "/", "legacy_element_id", "Use product_method only.");
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => issues.push(...forbiddenLegacyIssues(item, `${path}/${index}`)));
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key === "products_method") add(issues, `${path}/${key}`, "legacy_element_id", "Use product_method only.");
      issues.push(...forbiddenLegacyIssues(nested, `${path}/${key}`));
    }
  }
  return issues;
}

function metricMatches(
  metrics: readonly BackendMetric[],
  value: number,
  evidenceIds: readonly string[],
  unit: string | null,
): boolean {
  return metrics.some((metric) =>
    metric.value === value &&
    (unit === null || metric.unit === unit) &&
    metric.evidenceIds.some((id) => evidenceIds.includes(id)),
  );
}

function assertEvidenceIds(
  issues: P03ValidationIssue[],
  evidenceSet: ReadonlySet<string>,
  ids: readonly string[],
  path: string,
): void {
  ids.forEach((id, index) => {
    if (!evidenceSet.has(id)) add(issues, `${path}/${index}`, "dangling_evidence_id", `Evidence ${id} is absent from persisted P-01.`);
  });
}

function evidenceText(input: P03SelectedPreparedInput, ids: readonly string[]): string {
  const wanted = new Set(ids);
  return input.context.evidenceLedger
    .filter((item) => wanted.has(item.id))
    .map((item) => item.fact)
    .join(" ")
    .toLocaleLowerCase("ru-RU");
}

function canonicalSupport(result: P03ResultV1_4): P03ResultV1_4["supportingElements"] {
  return canonicalizeP03SupportingElements(result).supportingElements;
}

export function validateP03Invariants(
  result: P03ResultV1_4,
  input: P03SelectedPreparedInput,
): P03ResultV1_4 {
  const issues = forbiddenLegacyIssues(result);
  const normal = result.analysisStatus === "ok" || result.analysisStatus === "low_confidence";
  const blocked = !normal;
  const scenarioId = input.selectedScenario.scenario_id;
  const scenarioRule = getMoneyNowScenarioPrescriptionRule(scenarioId);
  const evidenceSet = new Set(input.context.evidenceLedger.map((item) => item.id));

  if (
    result.selectedScenario.scenario_id !== scenarioId ||
    result.selectedScenario.scenario_title !== input.selectedScenario.scenario_title
  ) {
    add(issues, "/selectedScenario", "selected_scenario_changed", "P-03 must echo immutable Stage 7 scenario ID/title exactly.");
  }
  if (result.lockedTeaser !== input.lockedTeaser) {
    add(issues, "/lockedTeaser", "locked_teaser_changed", "Locked teaser must be an exact backend echo.");
  }
  if (JSON.stringify(result.revenueScenario) !== JSON.stringify(input.backendRevenueScenario)) {
    add(issues, "/revenueScenario", "revenue_scenario_changed", "Revenue scenario must be an exact backend echo.");
  }

  assertEvidenceIds(issues, evidenceSet, result.diagnosis.evidence_ids, "/diagnosis/evidence_ids");
  assertEvidenceIds(issues, evidenceSet, result.diagnosis.counterevidence_ids, "/diagnosis/counterevidence_ids");
  result.sanityChecks.forEach((check, index) => {
    assertEvidenceIds(issues, evidenceSet, check.evidence_ids, `/sanityChecks/${index}/evidence_ids`);
  });

  const primary = result.diagnosis.primary_cause_code;
  const contributing = result.diagnosis.contributing_cause_codes;
  if (normal) {
    if (!primary) add(issues, "/diagnosis/primary_cause_code", "primary_cause_required", "ok/low_confidence requires a primary cause.");
    if (result.diagnosis.evidence_ids.length === 0) add(issues, "/diagnosis/evidence_ids", "cause_evidence_required", "Primary cause requires supporting evidence.");
    if (!result.businessPrescription || !result.targetMetric || !result.test30d) {
      add(issues, "/", "normal_prescription_required", "ok/low_confidence requires prescription, targetMetric and test30d.");
    }
  }
  if (blocked) {
    if (result.businessPrescription !== null || result.targetMetric !== null || result.test30d !== null) {
      add(issues, "/", "blocked_payload_must_be_null", "Blocked analytical outcomes cannot contain a prescription, metric or test.");
    }
    if (result.supportingElements.length !== 0) add(issues, "/supportingElements", "blocked_support_forbidden", "Blocked outcomes must not contain supporting elements.");
  }
  if (result.analysisStatus === "blocked_by_insufficient_evidence" && primary !== null) {
    add(issues, "/diagnosis/primary_cause_code", "insufficient_evidence_primary_forbidden", "Insufficient evidence requires primary cause=null.");
  }

  if (primary && !scenarioRule.allowedPrimaryCauses.includes(primary)) {
    add(issues, "/diagnosis/primary_cause_code", "cause_not_allowed", `${primary} is not allowed as primary for ${scenarioId}.`);
  }
  const contributingSet = new Set<MoneyNowPrescriptionCauseCode>();
  contributing.forEach((cause, index) => {
    if (!scenarioRule.allowedContributingCauses.includes(cause)) {
      add(issues, `/diagnosis/contributing_cause_codes/${index}`, "contributing_cause_not_allowed", `${cause} is not allowed for ${scenarioId}.`);
    }
    if (cause === primary || contributingSet.has(cause)) {
      add(issues, `/diagnosis/contributing_cause_codes/${index}`, "duplicate_cause", "Contributing causes must be distinct from primary and each other.");
    }
    contributingSet.add(cause);
  });
  if (primary) {
    const considered = [primary, ...contributing];
    const earliest = scenarioRule.causePrecedence.find((cause) => considered.includes(cause));
    if (earliest && earliest !== primary) {
      add(issues, "/diagnosis/primary_cause_code", "cause_precedence_violation", `${earliest} precedes ${primary} for ${scenarioId}.`);
    }
  }

  if (primary === "OVERCONSULTING_FREE_VALUE") {
    const text = evidenceText(input, result.diagnosis.evidence_ids);
    const provesFreeSolution = /(?:бесплат|консульт|разбор).{0,100}(?:решен|рекомендац|план|существен|закрыва)/iu.test(text) ||
      /(?:решен|рекомендац|план|существен|закрыва).{0,100}(?:бесплат|консульт|разбор)/iu.test(text);
    if (!provesFreeSolution) {
      add(issues, "/diagnosis/evidence_ids", "gratitude_not_overconsulting_evidence", "Gratitude alone does not prove that a free contact delivered a substantial solution.");
    }
  }

  if (normal && primary && result.businessPrescription && result.targetMetric && result.test30d) {
    const interventions = result.businessPrescription.interventions;
    const codes = interventions.map((item) => item.intervention_code);
    const uniqueCodes = new Set(codes);
    if (uniqueCodes.size !== codes.length) add(issues, "/businessPrescription/interventions", "duplicate_intervention", "Intervention codes must be unique.");
    codes.forEach((code, index) => {
      if (!SELECTABLE_INTERVENTIONS.has(code)) add(issues, `/businessPrescription/interventions/${index}/intervention_code`, "unknown_intervention", `${code} is not a selectable canonical intervention.`);
    });
    const allowed = allowedInterventionsForCauses(scenarioId, primary, contributing);
    codes.forEach((code, index) => {
      if (!allowed.all.includes(code)) add(issues, `/businessPrescription/interventions/${index}/intervention_code`, "intervention_not_allowed", `${code} is not allowed for selected scenario/cause set.`);
    });
    if (!codes.some((code) => allowed.primary.includes(code))) {
      add(issues, "/businessPrescription/interventions", "primary_cause_intervention_required", "At least one intervention must belong to the primary cause matrix.");
    }
    if (!codes.some((code) => scenarioRule.anchorAnyOf.includes(code))) {
      add(issues, "/businessPrescription/interventions", "scenario_anchor_required", `Selected interventions must satisfy ${scenarioId}.anchorAnyOf.`);
    }
    result.test30d.actions.forEach((action, index) => {
      if (!uniqueCodes.has(action.intervention_code)) {
        add(issues, `/test30d/actions/${index}/intervention_code`, "test_action_not_selected", "Every test action must use a selected intervention code.");
      }
    });
    try {
      const expected = canonicalSupport(result);
      if (JSON.stringify(result.supportingElements) !== JSON.stringify(expected)) {
        add(issues, "/supportingElements", "supporting_elements_not_backend_derived", "Supporting elements must equal the backend-derived registry union.");
      }
    } catch (error) {
      if (error instanceof P03InvariantError) issues.push(...error.issues);
      else throw error;
    }

    const metric = result.targetMetric;
    assertEvidenceIds(issues, evidenceSet, metric.evidence_ids, "/targetMetric/evidence_ids");
    if (metric.baseline_value !== null && !metricMatches(input.backendMetrics, metric.baseline_value, metric.evidence_ids, metric.unit)) {
      add(issues, "/targetMetric/baseline_value", "unsupported_numeric_metric", "Numeric baseline must exactly match a backend metric with evidence provenance.");
    }
    if (metric.target_value !== null && !metricMatches(input.backendMetrics, metric.target_value, metric.evidence_ids, metric.unit)) {
      add(issues, "/targetMetric/target_value", "unsupported_numeric_metric", "Numeric target must exactly match a backend metric with evidence provenance.");
    }
    if (metric.source === "qualitative_rule" && (metric.baseline_value !== null || metric.target_value !== null)) {
      add(issues, "/targetMetric/source", "qualitative_metric_has_number", "qualitative_rule cannot carry numeric baseline/target.");
    }
    if (result.test30d.baseline !== null && result.test30d.baseline !== metric.baseline_value) {
      add(issues, "/test30d/baseline", "test_baseline_mismatch", "30-day test baseline must equal validated targetMetric baseline.");
    }
    if (result.test30d.repetitions !== null && !input.backendMetrics.some((item) => Number.isInteger(item.value) && item.value === result.test30d!.repetitions)) {
      add(issues, "/test30d/repetitions", "unsupported_repetition_count", "Repetitions require an exact integer backend/client metric.");
    }
    if (result.test30d.primary_metric.trim() !== metric.metric_name.trim()) {
      add(issues, "/test30d/primary_metric", "multiple_primary_metrics", "The test must use the single targetMetric metric_name.");
    }

    const title = result.businessPrescription.client_task_title.trim();
    if (/^(?:повысить|увеличить|улучшить|оптимизировать)\s+(?:конверси|ltv|продаж|эффективност)/iu.test(title)) {
      add(issues, "/businessPrescription/client_task_title", "metric_only_task_title", "Task title must name a concrete intervention, not a metric.");
    }
    if (/(?:рекомендуется|целесообразно|рассмотреть возможность|ai считает|алгоритм выявил)/iu.test(result.businessPrescription.coach_explanation)) {
      add(issues, "/businessPrescription/coach_explanation", "forbidden_coach_voice", "Coach explanation uses forbidden bureaucratic/AI wording.");
    }
    if (/(?:гарантир|точно получите|обязательно заработ)/iu.test(JSON.stringify(result.businessPrescription))) {
      add(issues, "/businessPrescription", "income_promise_forbidden", "Prescription must not promise income.");
    }

    const zeroStep = result.businessPrescription.zero_step;
    if (zeroStep) {
      assertEvidenceIds(issues, evidenceSet, zeroStep.evidence_ids, "/businessPrescription/zero_step/evidence_ids");
      const text = evidenceText(input, zeroStep.evidence_ids);
      if (!/(?:не\s+стою|страшно.{0,40}(?:цен|назва)|боюсь.{0,40}(?:цен|назва)|самообесцен|не\s+могу.{0,40}(?:назвать|предложить).{0,40}(?:цен|стоимост))/iu.test(text)) {
        add(issues, "/businessPrescription/zero_step/evidence_ids", "zero_step_not_self_value_evidence", "Zero step requires direct current self-value/price-fear evidence, not tactical uncertainty.");
      }
    }
  }

  const repeated = result.sanityChecks.find((check) => check.code === "REPEATED_INTERVENTION_WITHOUT_NEW_CONDITION");
  if (repeated) {
    const attemptEvidence = new Set(input.context.businessMap.experience.attempts.flatMap((attempt) => attempt.evidence_ids));
    if (!repeated.evidence_ids.some((id) => attemptEvidence.has(id))) {
      add(issues, "/sanityChecks", "repeated_intervention_missing_attempt_evidence", "Repeated intervention guard must reference a matched persisted attempt.");
    }
    if (normal) add(issues, "/analysisStatus", "repeated_intervention_must_block", "Repeated intervention without a new condition must block the prescription.");
  }

  if (issues.length) throw new P03InvariantError(issues);
  return result;
}

export function finalizeAndValidateP03Output(
  value: unknown,
  input: P03SelectedPreparedInput,
): P03ResultV1_4 {
  const schemaValid = validateP03Schema(value);
  const normalized = canonicalizeP03SupportingElements(schemaValid);
  validateP03Schema(normalized);
  return validateP03Invariants(normalized, input);
}

export const P03_OUTPUT_SCHEMA = p03OutputSchema as Record<string, unknown>;

