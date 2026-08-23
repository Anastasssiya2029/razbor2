import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import p03OutputSchema from "@/schemas/p03-money-now-prescription.output.v1.5.schema.json";
import {
  allowedInterventionsForCauses,
  derivePrescriptionSupportingElements,
  getMoneyNowScenarioPrescriptionRule,
  MONEY_NOW_PRESCRIPTION_REGISTRY,
  MONEY_NOW_RESERVED_CAUSE_CODES,
  MONEY_NOW_SELECTABLE_INTERVENTION_CODES,
  type MoneyNowInterventionCode,
  type MoneyNowPrescriptionCauseCode,
} from "@/server/7k/config/money-now-prescription-rules.v1";
import type { P03SelectedPreparedInput } from "./projections";
import type { BackendMetric, P03ResultV1_5 } from "./types";

export type P03ValidationIssue = { path: string; code: string; message: string };

export class P03SchemaValidationError extends Error {
  readonly code = "P03_SCHEMA_VALIDATION_FAILED" as const;
  constructor(readonly issues: P03ValidationIssue[]) {
    super("P-03 output does not satisfy schema 1.5");
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

export function validateP03Schema(value: unknown): P03ResultV1_5 {
  if (!validateSchema(value)) {
    throw new P03SchemaValidationError((validateSchema.errors ?? []).map(schemaIssue));
  }
  return value as P03ResultV1_5;
}

function add(issues: P03ValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function canonicalizeP03SupportingElements(
  result: P03ResultV1_5,
): P03ResultV1_5 {
  const normalized = structuredClone(result);
  if (normalized.targetMetric?.source === "qualitative_rule") {
    normalized.targetMetric.baseline_metric_code = null;
    normalized.targetMetric.baseline_value = null;
    normalized.targetMetric.target_metric_code = null;
    normalized.targetMetric.target_value = null;
    normalized.targetMetric.unit = null;
    if (normalized.test30d) normalized.test30d.baseline = null;
  }
  if (normalized.targetMetric && normalized.test30d) {
    normalized.test30d.primary_metric = normalized.targetMetric.metric_name;
  }
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
      message: `Selected interventions derive ${elements.length} supporting elements; schema 1.5 allows at most 3. Select a smaller causal set without losing the primary anchor.`,
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

function canonicalizeP03HistoryEvidence(
  result: P03ResultV1_5,
  input: P03SelectedPreparedInput,
): P03ResultV1_5 {
  const normalized = structuredClone(result);
  const attemptEvidence = new Set(
    input.context.businessMap.experience.attempts.flatMap((attempt) => attempt.evidence_ids),
  );
  const currentEvidence = new Set(
    input.context.evidenceLedger
      .filter((item) => item.time_scope === "current")
      .map((item) => item.id),
  );

  normalized.interventionHistoryReview = normalized.interventionHistoryReview.map((review) => ({
    ...review,
    matched_attempt_evidence_ids:
      review.match_status === "no_match" || review.match_status === "not_reported"
        ? []
        : review.matched_attempt_evidence_ids.filter((id) => attemptEvidence.has(id)),
    new_condition_evidence_ids:
      review.new_condition_status === "not_applicable"
        ? []
        : review.new_condition_evidence_ids.filter((id) => currentEvidence.has(id)),
  }));
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
  metricCode: string,
  allowedRoles: readonly BackendMetric["role"][],
  value: number,
  evidenceIds: readonly string[],
  unit: string | null,
): boolean {
  return metrics.some((metric) =>
    metric.metric_code === metricCode &&
    allowedRoles.includes(metric.role) &&
    metric.value === value &&
    (unit === null || metric.unit === unit) &&
    metric.evidence_ids.every((id) => evidenceIds.includes(id)),
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

function canonicalSupport(result: P03ResultV1_5): P03ResultV1_5["supportingElements"] {
  return canonicalizeP03SupportingElements(result).supportingElements;
}

export function validateP03Invariants(
  result: P03ResultV1_5,
  input: P03SelectedPreparedInput,
): P03ResultV1_5 {
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
    if (!result.diagnosis.cause_statement?.trim()) {
      add(issues, "/diagnosis/cause_statement", "cause_statement_required", "ok/low_confidence requires a cause statement.");
    }
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
  if (
    result.analysisStatus === "blocked_by_insufficient_evidence" &&
    result.diagnosis.cause_statement !== null
  ) {
    add(issues, "/diagnosis/cause_statement", "insufficient_evidence_statement_forbidden", "Insufficient evidence requires cause_statement=null.");
  }
  if (
    result.analysisStatus === "blocked_by_insufficient_evidence" &&
    result.diagnosis.contributing_cause_codes.length !== 0
  ) {
    add(issues, "/diagnosis/contributing_cause_codes", "insufficient_evidence_contributing_forbidden", "Insufficient evidence requires no contributing causes.");
  }
  if (primary === null && result.diagnosis.cause_statement !== null) {
    add(issues, "/diagnosis/cause_statement", "statement_without_cause", "A null primary cause requires cause_statement=null.");
  }
  if (primary && MONEY_NOW_RESERVED_CAUSE_CODES.includes(primary)) {
    add(issues, "/diagnosis/primary_cause_code", "reserved_cause_forbidden", `${primary} is reserved and cannot be selected by P-03.`);
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

  const attempts = input.context.businessMap.experience.attempts;
  const attemptEvidence = new Set(attempts.flatMap((attempt) => attempt.evidence_ids));
  const currentEvidence = new Set(
    input.context.evidenceLedger
      .filter((item) => item.time_scope === "current")
      .map((item) => item.id),
  );
  const scenarioInterventions = new Set(
    Object.values(MONEY_NOW_PRESCRIPTION_REGISTRY.scenarioCauseInterventions[scenarioId])
      .flatMap((codes) => codes ?? []),
  );
  const reviewCodes = result.interventionHistoryReview.map((review) => review.intervention_code);
  const uniqueReviewCodes = new Set(reviewCodes);
  if (uniqueReviewCodes.size !== reviewCodes.length) {
    add(issues, "/interventionHistoryReview", "duplicate_history_review", "Each intervention can have exactly one history review.");
  }
  result.interventionHistoryReview.forEach((review, index) => {
    const path = `/interventionHistoryReview/${index}`;
    if (!scenarioInterventions.has(review.intervention_code)) {
      add(issues, `${path}/intervention_code`, "history_review_intervention_not_visible", "History review can reference only an intervention exposed for the selected scenario.");
    }
    assertEvidenceIds(issues, evidenceSet, review.matched_attempt_evidence_ids, `${path}/matched_attempt_evidence_ids`);
    assertEvidenceIds(issues, evidenceSet, review.new_condition_evidence_ids, `${path}/new_condition_evidence_ids`);
    review.matched_attempt_evidence_ids.forEach((id, evidenceIndex) => {
      if (!attemptEvidence.has(id)) {
        add(issues, `${path}/matched_attempt_evidence_ids/${evidenceIndex}`, "history_review_not_attempt_evidence", `${id} is not linked to a persisted experience attempt.`);
      }
    });
    review.new_condition_evidence_ids.forEach((id, evidenceIndex) => {
      if (!currentEvidence.has(id)) {
        add(issues, `${path}/new_condition_evidence_ids/${evidenceIndex}`, "new_condition_not_current", `${id} is not current evidence for a new condition.`);
      }
    });

    if (review.match_status === "not_reported") {
      if (attempts.length !== 0) {
        add(issues, `${path}/match_status`, "not_reported_with_attempts", "Use no_match, matched or unclear when persisted attempts exist.");
      }
      if (review.matched_attempt_evidence_ids.length || review.new_condition_evidence_ids.length) {
        add(issues, path, "not_reported_has_evidence", "not_reported requires empty attempt and new-condition evidence.");
      }
      if (review.new_condition_status !== "not_applicable" || review.conclusion !== "clear_to_test") {
        add(issues, path, "not_reported_semantics", "not_reported requires new_condition_status=not_applicable and conclusion=clear_to_test.");
      }
    }
    if (review.match_status === "no_match") {
      if (attempts.length === 0) {
        add(issues, `${path}/match_status`, "no_match_without_history", "no_match requires at least one persisted attempt to review.");
      }
      if (
        review.new_condition_status !== "not_applicable" ||
        review.new_condition_evidence_ids.length !== 0 ||
        review.conclusion !== "clear_to_test"
      ) {
        add(issues, path, "no_match_semantics", "no_match requires no new condition and conclusion=clear_to_test.");
      }
    }
    if (review.match_status === "matched") {
      if (review.matched_attempt_evidence_ids.length === 0) {
        add(issues, `${path}/matched_attempt_evidence_ids`, "matched_attempt_evidence_required", "matched requires evidence linked to a persisted attempt.");
      }
      if (review.new_condition_status === "confirmed") {
        if (review.new_condition_evidence_ids.length === 0) {
          add(issues, `${path}/new_condition_evidence_ids`, "confirmed_new_condition_evidence_required", "A confirmed new condition requires current evidence.");
        }
        if (review.conclusion !== "clear_to_test") {
          add(issues, `${path}/conclusion`, "confirmed_new_condition_conclusion", "A confirmed new condition requires conclusion=clear_to_test.");
        }
      } else if (
        review.new_condition_status === "not_confirmed" ||
        review.new_condition_status === "unknown"
      ) {
        if (review.conclusion !== "blocked_repeat_without_new_condition") {
          add(issues, `${path}/conclusion`, "repeat_without_condition_conclusion", "An unconfirmed/unknown new condition must block the repeated intervention.");
        }
        if (result.analysisStatus !== "blocked_by_inconsistency") {
          add(issues, "/analysisStatus", "repeat_without_condition_status", "A matched repeated intervention without a confirmed new condition requires blocked_by_inconsistency.");
        }
      } else {
        add(issues, `${path}/new_condition_status`, "matched_condition_not_applicable", "matched cannot use new_condition_status=not_applicable.");
      }
    }
    if (review.match_status === "unclear") {
      if (review.conclusion !== "blocked_insufficient_history_evidence") {
        add(issues, `${path}/conclusion`, "unclear_history_conclusion", "unclear requires blocked_insufficient_history_evidence.");
      }
      if (result.analysisStatus !== "blocked_by_insufficient_evidence") {
        add(issues, "/analysisStatus", "unclear_history_status", "Unclear intervention history requires blocked_by_insufficient_evidence.");
      }
    }
  });

  if (normal && result.businessPrescription) {
    const selectedCodes = result.businessPrescription.interventions.map((item) => item.intervention_code);
    if (
      selectedCodes.length !== reviewCodes.length ||
      selectedCodes.some((code) => !uniqueReviewCodes.has(code))
    ) {
      add(issues, "/interventionHistoryReview", "history_review_coverage", "Every selected intervention requires exactly one structured history review.");
    }
    if (result.interventionHistoryReview.some((review) => review.conclusion !== "clear_to_test")) {
      add(issues, "/interventionHistoryReview", "normal_history_review_blocked", "ok/low_confidence can contain only clear_to_test history reviews.");
    }
  }
  if (
    result.analysisStatus === "blocked_by_insufficient_evidence" &&
    result.interventionHistoryReview.length > 0 &&
    !result.interventionHistoryReview.some(
      (review) => review.conclusion === "blocked_insufficient_history_evidence",
    )
  ) {
    add(issues, "/interventionHistoryReview", "insufficient_history_review_reason_missing", "A non-empty history review on insufficient evidence must identify an unclear history match.");
  }
  if (
    result.analysisStatus === "blocked_by_inconsistency" &&
    !result.interventionHistoryReview.some(
      (review) => review.conclusion === "blocked_repeat_without_new_condition",
    ) &&
    !result.sanityChecks.some((check) => check.severity === "error")
  ) {
    add(issues, "/", "inconsistency_reason_missing", "blocked_by_inconsistency requires a blocking history review or error sanity check.");
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
    if (metric.baseline_value === null && metric.baseline_metric_code !== null) {
      add(issues, "/targetMetric/baseline_metric_code", "baseline_code_without_value", "A null baseline requires baseline_metric_code=null.");
    }
    if (metric.baseline_value !== null) {
      if (!metric.baseline_metric_code) {
        add(issues, "/targetMetric/baseline_metric_code", "baseline_metric_code_required", "Numeric baseline requires an exact backend metric code.");
      } else if (!metricMatches(
        input.backendMetrics,
        metric.baseline_metric_code,
        ["baseline", "reference"],
        metric.baseline_value,
        metric.evidence_ids,
        metric.unit,
      )) {
        add(issues, "/targetMetric/baseline_value", "unsupported_baseline_metric", "Numeric baseline must exactly match a baseline/reference backend metric with evidence provenance.");
      }
    }
    if (metric.target_value === null && metric.target_metric_code !== null) {
      add(issues, "/targetMetric/target_metric_code", "target_code_without_value", "A null target requires target_metric_code=null.");
    }
    if (metric.target_value !== null) {
      if (!metric.target_metric_code) {
        add(issues, "/targetMetric/target_metric_code", "target_metric_code_required", "Numeric target requires an exact backend target metric code.");
      } else if (!metricMatches(
        input.backendMetrics,
        metric.target_metric_code,
        ["target"],
        metric.target_value,
        metric.evidence_ids,
        metric.unit,
      )) {
        add(issues, "/targetMetric/target_value", "unsupported_target_metric", "Numeric target must exactly match a role=target backend metric; baseline/reference values cannot be reused.");
      }
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
): P03ResultV1_5 {
  const schemaValid = validateP03Schema(value);
  const normalized = canonicalizeP03HistoryEvidence(
    canonicalizeP03SupportingElements(schemaValid),
    input,
  );
  validateP03Schema(normalized);
  return validateP03Invariants(normalized, input);
}

export const P03_OUTPUT_SCHEMA = p03OutputSchema as Record<string, unknown>;
