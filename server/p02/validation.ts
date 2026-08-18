import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import p02OutputSchema from "@/schemas/p02-transition-strategist.output.v1.3.schema.json";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId, type SevenKScores } from "@/server/7k/types";
import type { P01StrategyContext, P02ResultV1_3, TargetConfigProjection } from "./types";

export type P02ValidationIssue = { path: string; code: string; message: string };

export class P02SchemaValidationError extends Error {
  readonly code = "P02_SCHEMA_VALIDATION_FAILED" as const;
  constructor(readonly issues: P02ValidationIssue[]) {
    super("P-02 output does not satisfy schema v1.3");
    this.name = "P02SchemaValidationError";
  }
}

export class P02InvariantError extends Error {
  readonly code = "P02_INVARIANT_FAILED" as const;
  constructor(readonly issues: P02ValidationIssue[]) {
    super("P-02 output violates semantic invariants");
    this.name = "P02InvariantError";
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(p02OutputSchema);
const ELEMENT_SET = new Set<string>(SEVEN_K_ELEMENT_IDS);

function schemaIssue(error: ErrorObject): P02ValidationIssue {
  return { path: error.instancePath || "/", code: `schema.${error.keyword}`, message: error.message ?? "Schema validation failed" };
}

export function validateP02Schema(value: unknown): P02ResultV1_3 {
  if (!validateSchema(value)) throw new P02SchemaValidationError((validateSchema.errors ?? []).map(schemaIssue));
  return value as P02ResultV1_3;
}

function add(issues: P02ValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function forbiddenOutputIssues(value: unknown, path = ""): P02ValidationIssue[] {
  const issues: P02ValidationIssue[] = [];
  if (value === "products_method") add(issues, path || "/", "legacy_element_id", "Use product_method only.");
  if (Array.isArray(value)) value.forEach((item, index) => issues.push(...forbiddenOutputIssues(item, `${path}/${index}`)));
  else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (["products_method", "task_id", "task", "done_when", "moneyNowScenario", "clientScript"].includes(key)) {
        add(issues, `${path}/${key}`, "forbidden_output", `${key} is forbidden in P-02 output.`);
      }
      issues.push(...forbiddenOutputIssues(nested, `${path}/${key}`));
    }
  }
  return issues;
}

function evidenceReferences(result: P02ResultV1_3): Array<{ path: string; ids: string[] }> {
  const refs = [
    { path: "/constraint/root_evidence_ids", ids: result.constraint.root_evidence_ids },
    { path: "/constraint/counterevidence_ids", ids: result.constraint.counterevidence_ids },
    { path: "/perceivedVsEvidenced/evidence_ids", ids: result.perceivedVsEvidenced.evidence_ids },
    { path: "/businessValidation/evidence_ids", ids: result.businessValidation.evidence_ids },
  ];
  result.candidateAudit.forEach((candidate, index) => refs.push(
    { path: `/candidateAudit/${index}/supporting_evidence_ids`, ids: candidate.supporting_evidence_ids },
    { path: `/candidateAudit/${index}/counterevidence_ids`, ids: candidate.counterevidence_ids },
  ));
  result.elementSequence.forEach((step, index) => refs.push({ path: `/elementSequence/${index}/evidence_ids`, ids: step.evidence_ids }));
  result.sanityChecks.forEach((check, index) => refs.push({ path: `/sanityChecks/${index}/evidence_ids`, ids: check.evidence_ids }));
  if (result.previousAttemptsAnalysis) refs.push({ path: "/previousAttemptsAnalysis/evidence_ids", ids: result.previousAttemptsAnalysis.evidence_ids });
  return refs;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/gu, " ");
}

export function validateP02Invariants(
  result: P02ResultV1_3,
  input: { strategyContext: P01StrategyContext; targetConfig: TargetConfigProjection; currentScores: SevenKScores },
): P02ResultV1_3 {
  const issues = forbiddenOutputIssues(result);
  const normal = result.analysisStatus === "ok" || result.analysisStatus === "low_confidence";
  const priority = result.bundle.priority_element;
  if (normal && priority === null) add(issues, "/bundle/priority_element", "priority_required", "ok/low_confidence requires one priority element.");
  if (normal && result.elementSequence.length === 0) add(issues, "/elementSequence", "sequence_required", "ok/low_confidence requires milestones.");

  const roles = new Map<SevenKElementId, string[]>();
  const assign = (id: SevenKElementId, role: string) => roles.set(id, [...(roles.get(id) ?? []), role]);
  if (priority) assign(priority, "priority");
  result.bundle.build_elements.forEach((id) => assign(id, "build"));
  result.bundle.maintain_elements.forEach((id) => assign(id, "maintain"));
  result.bundle.later_elements.forEach((item) => assign(item.element_id, "later"));
  for (const id of SEVEN_K_ELEMENT_IDS) {
    const assigned = roles.get(id) ?? [];
    if (assigned.length !== 1) add(issues, "/bundle", "broken_7k_partition", `${id} must appear in exactly one bundle role; got ${assigned.join(",") || "none"}.`);
  }
  if (result.bundle.build_elements.length > 2) add(issues, "/bundle/build_elements", "too_many_build_elements", "At most two build elements are allowed.");

  const active = new Set<SevenKElementId>([...(priority ? [priority] : []), ...result.bundle.build_elements]);
  active.forEach((id) => {
    if (input.targetConfig.targetScores[id] <= input.currentScores[id]) {
      add(issues, `/bundle/${id}`, "target_gap_zero", `${id} cannot be priority/build when targetScore <= currentScore.`);
    }
  });

  const orders = result.elementSequence.map((step) => step.order);
  const uniqueOrders = new Set(orders);
  if (uniqueOrders.size !== orders.length || orders.some((order, index) => order !== index + 1)) {
    add(issues, "/elementSequence", "invalid_order_chain", "Orders must be unique and sequential from 1.");
  }
  const previousTo = new Map<SevenKElementId, number>();
  result.elementSequence.forEach((step, index) => {
    if (!active.has(step.element_id)) add(issues, `/elementSequence/${index}/element_id`, "sequence_outside_bundle", "Milestones may use priority/build only.");
    const expectedRole = step.element_id === priority ? "priority" : "build";
    if (step.role !== expectedRole) add(issues, `/elementSequence/${index}/role`, "sequence_role_mismatch", `Expected ${expectedRole}.`);
    const expectedFrom = previousTo.get(step.element_id) ?? input.currentScores[step.element_id];
    if (step.from_score !== expectedFrom) add(issues, `/elementSequence/${index}/from_score`, "broken_milestone_chain", `Expected from_score ${expectedFrom}.`);
    if (step.to_score <= step.from_score) add(issues, `/elementSequence/${index}/to_score`, "non_increasing_milestone", "to_score must be greater than from_score.");
    if (step.to_score > input.targetConfig.targetScores[step.element_id]) add(issues, `/elementSequence/${index}/to_score`, "milestone_above_target", "Milestone cannot exceed persisted target.");
    previousTo.set(step.element_id, step.to_score);
  });
  if (normal && !uniqueOrders.has(result.businessValidation.checkpoint_after_order)) {
    add(issues, "/businessValidation/checkpoint_after_order", "checkpoint_outside_sequence", "Checkpoint must point to an existing milestone order.");
  }
  if (!/(?:переоцен|пересмотр|проверить\s+гипотез|reevaluat|reassess)/iu.test(result.businessValidation.if_signal_absent)) {
    add(issues, "/businessValidation/if_signal_absent", "missing_constraint_reevaluation", "Absent signal must trigger constraint reevaluation, not automatic continuation.");
  }
  const allowedBusinessNumbers = new Set<number>();
  input.strategyContext.moneyChainFacts.forEach((fact) => {
    [fact.value, fact.denominator, fact.conversionPct].forEach((value) => {
      if (value !== null) allowedBusinessNumbers.add(value);
    });
  });
  if (input.strategyContext.desiredSystemWeeklyHours !== null) {
    allowedBusinessNumbers.add(input.strategyContext.desiredSystemWeeklyHours);
  }
  const validation = result.businessValidation;
  if (validation.baseline_value !== null && !allowedBusinessNumbers.has(validation.baseline_value)) {
    add(issues, "/businessValidation/baseline_value", "unsupported_business_number", "Baseline must come from persisted client/backend facts.");
  }
  if (
    validation.target_value !== null &&
    !allowedBusinessNumbers.has(validation.target_value) &&
    (!validation.formula?.trim() || validation.evidence_ids.length === 0)
  ) {
    add(issues, "/businessValidation/target_value", "unsupported_business_number", "A derived target requires a formula and persisted evidence; market averages are forbidden.");
  }

  const evidenceIds = new Set(input.strategyContext.evidenceLedger.map((item) => item.id));
  evidenceReferences(result).forEach(({ path, ids }) => ids.forEach((id, index) => {
    if (!evidenceIds.has(id)) add(issues, `${path}/${index}`, "dangling_evidence_id", `Evidence ${id} is absent from persisted P-01 ledger.`);
  }));

  if (result.candidateAudit.length > 0) {
    const selected = result.candidateAudit.filter((candidate) => candidate.decision === "selected");
    if (selected.length !== 1) add(issues, "/candidateAudit", "candidate_selected_count", "Candidate audit must have exactly one selected candidate.");
    if (selected[0] && selected[0].element_id !== priority) add(issues, "/candidateAudit", "candidate_priority_mismatch", "Selected candidate must equal priority element.");
    result.candidateAudit.forEach((candidate, index) => {
      if (candidate.decision === "selected") {
        if (candidate.tie_break_step !== null) add(issues, `/candidateAudit/${index}/tie_break_step`, "selected_tie_break_step_forbidden", "Selected candidate must have tie_break_step=null.");
        if (candidate.rejection_reason !== null) add(issues, `/candidateAudit/${index}/rejection_reason`, "selected_rejection_reason_forbidden", "Selected candidate must have rejection_reason=null.");
      } else {
        if (!Number.isInteger(candidate.tie_break_step) || candidate.tie_break_step! < 0 || candidate.tie_break_step! > 7) add(issues, `/candidateAudit/${index}/tie_break_step`, "tie_break_step_required", "Rejected candidate tie_break_step must be 0–7.");
        if (!candidate.rejection_reason?.trim()) add(issues, `/candidateAudit/${index}/rejection_reason`, "rejection_reason_required", "Rejected candidate needs a reason.");
      }
    });
  }

  const struggles = input.strategyContext.businessMap.experience.strugglesSummary?.trim() || null;
  if (!struggles) {
    if (result.perceivedVsEvidenced.client_hypothesis !== null || result.perceivedVsEvidenced.relation !== "insufficient_data") {
      add(issues, "/perceivedVsEvidenced", "perceived_barrier_without_struggles", "Without struggles, client_hypothesis must be null and relation insufficient_data.");
    }
  } else if (!result.perceivedVsEvidenced.client_hypothesis?.trim()) {
    add(issues, "/perceivedVsEvidenced/client_hypothesis", "client_hypothesis_required", "Filled struggles must be compared with evidence.");
  }

  const experience = input.strategyContext.businessMap.experience;
  const hasFailures = Boolean(experience.failuresSummary?.trim()) || experience.attempts.length > 0;
  if (!hasFailures && result.previousAttemptsAnalysis !== null) add(issues, "/previousAttemptsAnalysis", "attempts_without_failure_history", "No failures means previousAttemptsAnalysis must be null.");
  if (result.previousAttemptsAnalysis?.repeated_break_pattern && experience.attempts.length < 2) {
    add(issues, "/previousAttemptsAnalysis/repeated_break_pattern", "repeated_pattern_not_evidenced", "Repeated-break pattern requires at least two persisted attempts.");
  }

  const selectedSanityErrors = result.sanityChecks.filter((check) => check.severity === "error");
  selectedSanityErrors.forEach((check, index) => add(issues, `/sanityChecks/${index}`, `sanity.${check.code}`, check.message));
  if (normalized(result.constraint.symptom) === normalized(result.constraint.functional_bottleneck) || normalized(result.constraint.functional_bottleneck) === normalized(result.constraint.root_cause)) {
    add(issues, "/constraint", "collapsed_causal_layers", "symptom, functional bottleneck and root cause must be distinct.");
  }
  for (const id of [...active]) if (!ELEMENT_SET.has(id)) add(issues, "/bundle", "unknown_element_id", `Unknown element ${id}.`);

  if (issues.length) throw new P02InvariantError(issues);
  return result;
}

export const P02_OUTPUT_SCHEMA = p02OutputSchema as Record<string, unknown>;
