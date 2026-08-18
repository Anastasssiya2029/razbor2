import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import p01OutputSchema from "@/schemas/p01-evidence-scorer.output.v1.4.schema.json";
import {
  MONEY_NOW_FACT_CODES,
  MONEY_NOW_FACT_EVIDENCE_POLICIES,
  type MoneyNowFactEvidencePolicy,
} from "@/server/7k/config/money-now-fact-extraction.v1";
import {
  MONEY_NOW_MATERIAL_CONDITION_FACT_CODES,
  MONEY_NOW_MATERIAL_CONDITION_PRIMARY_CODES,
} from "@/server/7k/config/money-now-selector-contract.v1";
import { MONEY_NOW_SCENARIO_IDS } from "@/server/7k/config/money-now.v2.2";
import { MODEL_FAMILIES, BASE_MODEL_FAMILIES } from "@/server/7k/config/target-rules.v2.1";
import { SCORING_RULES } from "@/server/7k/config/scoring-rules.v2.0";
import { TARGET_RULE_CODE_SET } from "@/server/7k/config/target-model-dictionary.v2.1";
import { SEVEN_K_ELEMENT_IDS } from "@/server/7k/types";
import type { P01ResultV1_4_1 } from "./types";

export type P01ValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export class P01SchemaValidationError extends Error {
  readonly code = "P01_SCHEMA_VALIDATION_FAILED" as const;
  readonly issues: P01ValidationIssue[];

  constructor(issues: P01ValidationIssue[]) {
    super("P-01 output does not satisfy schema v1.4 / prompt P-01.v1.4.1");
    this.name = "P01SchemaValidationError";
    this.issues = issues;
  }
}

export class P01InvariantError extends Error {
  readonly code = "P01_INVARIANT_FAILED" as const;
  readonly issues: P01ValidationIssue[];

  constructor(issues: P01ValidationIssue[]) {
    super("P-01 output violates semantic invariants");
    this.name = "P01InvariantError";
    this.issues = issues;
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(p01OutputSchema);
const ELEMENT_SET = new Set<string>(SEVEN_K_ELEMENT_IDS);
const MODEL_SET = new Set<string>(MODEL_FAMILIES);
const BASE_MODEL_SET = new Set<string>(BASE_MODEL_FAMILIES);
const SCORING_RULE_IDS = new Set(
  SEVEN_K_ELEMENT_IDS.flatMap((elementId) =>
    SCORING_RULES.elements[elementId].levels.map((level) => level.ruleId),
  ),
);

function schemaIssue(error: ErrorObject): P01ValidationIssue {
  return {
    path: error.instancePath || "/",
    code: `schema.${error.keyword}`,
    message: error.message ?? "Schema validation failed",
  };
}

export function validateP01Schema(value: unknown): P01ResultV1_4_1 {
  if (!validateSchema(value)) {
    throw new P01SchemaValidationError((validateSchema.errors ?? []).map(schemaIssue));
  }
  return value as P01ResultV1_4_1;
}

function findForbiddenLegacyId(value: unknown, path = ""): P01ValidationIssue[] {
  const issues: P01ValidationIssue[] = [];
  if (value === "products_method") {
    issues.push({ path: path || "/", code: "legacy_element_id", message: "products_method запрещён в P-01." });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => issues.push(...findForbiddenLegacyId(item, `${path}/${index}`)));
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "products_method") {
        issues.push({ path: `${path}/${key}`, code: "legacy_element_id", message: "Используйте product_method." });
      }
      issues.push(...findForbiddenLegacyId(child, `${path}/${key}`));
    }
  }
  return issues;
}

function addDanglingEvidenceIssues(
  issues: P01ValidationIssue[],
  ids: readonly string[],
  evidenceIds: ReadonlySet<string>,
  path: string,
): void {
  ids.forEach((id, index) => {
    if (!evidenceIds.has(id)) {
      issues.push({ path: `${path}/${index}`, code: "dangling_evidence_id", message: `Evidence ${id} отсутствует в ledger.` });
    }
  });
}

function allEvidenceReferences(result: P01ResultV1_4_1): Array<{ path: string; ids: string[] }> {
  const references: Array<{ path: string; ids: string[] }> = [];
  for (const elementId of SEVEN_K_ELEMENT_IDS) {
    const score = result.current7k[elementId];
    references.push(
      { path: `/current7k/${elementId}/evidence_ids`, ids: score.evidence_ids },
      { path: `/current7k/${elementId}/counterevidence_ids`, ids: score.counterevidence_ids },
    );
  }
  result.businessMap.experience.attempts.forEach((attempt, index) =>
    references.push({ path: `/businessMap/experience/attempts/${index}/evidence_ids`, ids: attempt.evidence_ids }),
  );
  result.moneyChainFacts.forEach((fact, index) =>
    references.push({ path: `/moneyChainFacts/${index}/evidence_ids`, ids: fact.evidence_ids }),
  );
  result.moneyNowSignals.forEach((signal, index) =>
    references.push({ path: `/moneyNowSignals/${index}/evidence_ids`, ids: signal.evidence_ids }),
  );
  MONEY_NOW_FACT_CODES.forEach((factCode) =>
    references.push({
      path: `/moneyNowFacts/${factCode}/evidence_ids`,
      ids: result.moneyNowFacts[factCode].evidence_ids,
    }),
  );
  MONEY_NOW_SCENARIO_IDS.forEach((scenarioId) => {
    const history = result.moneyNowHistory[scenarioId];
    references.push(
      { path: `/moneyNowHistory/${scenarioId}/evidence_ids`, ids: history.evidence_ids },
      { path: `/moneyNowHistory/${scenarioId}/new_condition_evidence_ids`, ids: history.new_condition_evidence_ids },
    );
  });
  result.sanityChecks.forEach((check, index) =>
    references.push({ path: `/sanityChecks/${index}/evidence_ids`, ids: check.evidence_ids }),
  );
  return references;
}

function isAllowedFactEvidenceScope(
  policy: MoneyNowFactEvidencePolicy,
  timeScope: P01ResultV1_4_1["evidenceLedger"][number]["time_scope"],
): boolean {
  if (timeScope === "hypothesis") return false;
  if (policy === "current_required") return timeScope === "current";
  if (policy === "current_or_historical_repeatable") {
    return timeScope === "current" || timeScope === "historical_repeatable";
  }
  return (
    timeScope === "current" ||
    timeScope === "historical_repeatable" ||
    timeScope === "historical_only"
  );
}

export function validateP01Invariants(result: P01ResultV1_4_1): P01ResultV1_4_1 {
  const issues = findForbiddenLegacyId(result);
  const evidenceById = new Map(result.evidenceLedger.map((evidence) => [evidence.id, evidence]));
  if (evidenceById.size !== result.evidenceLedger.length) {
    issues.push({ path: "/evidenceLedger", code: "duplicate_evidence_id", message: "Evidence IDs должны быть уникальными." });
  }

  for (const evidence of result.evidenceLedger) {
    if (/^(?:target\.|\/target\/)/u.test(evidence.source_field)) {
      issues.push({
        path: `/evidenceLedger/${evidence.id}/source_field`,
        code: "target_evidence_in_current_ledger",
        message: "Target evidence запрещён в current evidence ledger.",
      });
    }
    evidence.elements.forEach((elementId) => {
      if (!ELEMENT_SET.has(elementId)) {
        issues.push({ path: `/evidenceLedger/${evidence.id}/elements`, code: "unknown_element", message: `Неизвестный элемент ${elementId}.` });
      }
    });
  }

  const mustHaveScores = result.analysisStatus === "ok" || result.analysisStatus === "low_confidence";
  for (const elementId of SEVEN_K_ELEMENT_IDS) {
    const element = result.current7k[elementId];
    if (mustHaveScores && (!Number.isInteger(element.score) || element.score === null)) {
      issues.push({ path: `/current7k/${elementId}/score`, code: "score_required", message: "Для ok/low_confidence требуется integer 0–10." });
    }
    if (element.score !== null && element.evidence_cap !== null && element.score > element.evidence_cap) {
      issues.push({ path: `/current7k/${elementId}/score`, code: "score_above_cap", message: `Score ${element.score} выше evidence_cap ${element.evidence_cap}.` });
    }
    if (element.matched_level_rule_id !== null && !SCORING_RULE_IDS.has(element.matched_level_rule_id)) {
      issues.push({ path: `/current7k/${elementId}/matched_level_rule_id`, code: "unknown_scoring_rule", message: "Неизвестный scoring rule ID." });
    }
    if (element.next_level_rule_id !== null && !SCORING_RULE_IDS.has(element.next_level_rule_id)) {
      issues.push({ path: `/current7k/${elementId}/next_level_rule_id`, code: "unknown_scoring_rule", message: "Неизвестный next scoring rule ID." });
    }
  }

  const evidenceIds = new Set(evidenceById.keys());
  allEvidenceReferences(result).forEach(({ path, ids }) =>
    addDanglingEvidenceIssues(issues, ids, evidenceIds, path),
  );

  for (const factCode of MONEY_NOW_FACT_CODES) {
    const fact = result.moneyNowFacts[factCode];
    const factEvidence = fact.evidence_ids
      .map((id) => evidenceById.get(id))
      .filter((evidence): evidence is P01ResultV1_4_1["evidenceLedger"][number] =>
        evidence !== undefined,
      );
    const path = `/moneyNowFacts/${factCode}`;
    const evidencePolicy = MONEY_NOW_FACT_EVIDENCE_POLICIES[factCode];
    const policyEvidence = factEvidence.filter((evidence) =>
      isAllowedFactEvidenceScope(evidencePolicy, evidence.time_scope),
    );

    if (fact.state === "confirmed_true" && fact.evidence_ids.length === 0) {
      issues.push({
        path: `${path}/evidence_ids`,
        code: "money_now_true_without_evidence",
        message: "confirmed_true требует минимум одно evidence.",
      });
    }
    if (fact.state === "confirmed_false") {
      if (fact.evidence_ids.length === 0) {
        issues.push({
          path: `${path}/evidence_ids`,
          code: "money_now_false_without_evidence",
          message: "confirmed_false требует evidence с valence=negative и допустимым time_scope.",
        });
      } else if (
        !policyEvidence.some((evidence) => evidence.valence === "negative")
      ) {
        issues.push({
          path: `${path}/evidence_ids`,
          code: "money_now_false_without_negative_evidence",
          message:
            "confirmed_false требует evidence с valence=negative и time_scope, разрешённым evidencePolicy; metric_result без negative valence недостаточен.",
        });
      }
    }
    if (
      fact.state !== "unknown" &&
      policyEvidence.length === 0
    ) {
      issues.push({
        path: `${path}/evidence_ids`,
        code: "money_now_fact_without_policy_evidence",
        message: `State ${fact.state} требует evidence по policy=${evidencePolicy}; hypothesis и запрещённые historical scopes не подтверждают факт.`,
      });
    }
    if (
      factCode === "PRICE_LIMITS_ECONOMICS_CONFIRMED" &&
      fact.state === "confirmed_true" &&
      !factEvidence.some(
        (evidence) =>
          evidence.evidence_type === "metric_result" &&
          evidence.time_scope === "current",
      )
    ) {
      issues.push({
        path: `${path}/evidence_ids`,
        code: "money_now_price_without_internal_economics",
        message: "Ограничение цены подтверждается current internal economics, а не рыночной нормой.",
      });
    }
  }

  const target = result.targetIntent;
  if (target.normalizedModelFamily !== null && !MODEL_SET.has(target.normalizedModelFamily)) {
    issues.push({ path: "/targetIntent/normalizedModelFamily", code: "unknown_model_family", message: "Неизвестная model_family." });
  }
  if (target.primaryModelFamily !== null && !BASE_MODEL_SET.has(target.primaryModelFamily)) {
    issues.push({ path: "/targetIntent/primaryModelFamily", code: "unknown_model_family", message: "Неизвестная primary model_family." });
  }
  target.secondaryModelFamilies.forEach((model, index) => {
    if (!BASE_MODEL_SET.has(model)) issues.push({ path: `/targetIntent/secondaryModelFamilies/${index}`, code: "unknown_model_family", message: "Неизвестная secondary model_family." });
  });
  target.activatedCapabilities.forEach((capability, index) => {
    if (!TARGET_RULE_CODE_SET.has(capability.code)) {
      issues.push({ path: `/targetIntent/activatedCapabilities/${index}/code`, code: "unknown_capability", message: `Capability ${capability.code} отсутствует в target-rules.v2.1.` });
    }
  });

  MONEY_NOW_SCENARIO_IDS.forEach((scenarioId) => {
    const history = result.moneyNowHistory[scenarioId];
    const historyPath = `/moneyNowHistory/${scenarioId}`;
    if (history.new_material_condition === "yes") {
      if (history.new_condition_evidence_ids.length === 0) {
        issues.push({ path: `${historyPath}/new_condition_evidence_ids`, code: "new_condition_without_evidence", message: "new_material_condition=yes требует current evidence." });
      }
      history.new_condition_evidence_ids.forEach((evidenceId, index) => {
        const evidence = evidenceById.get(evidenceId);
        if (evidence && evidence.time_scope !== "current") {
          issues.push({ path: `${historyPath}/new_condition_evidence_ids/${index}`, code: "new_condition_not_current", message: "Новое существенное условие должно ссылаться на current evidence." });
        }
      });
      const allowedPrimaryCodes = MONEY_NOW_MATERIAL_CONDITION_PRIMARY_CODES[scenarioId];
      const selectedPrimaryCodes = history.condition_codes.filter((code) =>
        allowedPrimaryCodes.includes(code),
      );
      if (selectedPrimaryCodes.length === 0) {
        issues.push({
          path: `${historyPath}/condition_codes`,
          code: "new_condition_without_scenario_primary_code",
          message: "Новое условие требует scenario-compatible primary code; SEQUENCE/OTHER_PREREQUISITE alone недостаточны.",
        });
      } else {
        const linkedConditionExists = selectedPrimaryCodes.some((conditionCode) => {
          const mappedFactCodes = MONEY_NOW_MATERIAL_CONDITION_FACT_CODES[conditionCode];
          return history.new_condition_evidence_ids.some((evidenceId) => {
            const evidence = evidenceById.get(evidenceId);
            if (evidence?.time_scope !== "current") return false;
            return mappedFactCodes.some((factCode) => {
              const fact = result.moneyNowFacts[factCode];
              return (
                fact.state === "confirmed_true" &&
                fact.evidence_ids.includes(evidenceId)
              );
            });
          });
        });
        if (!linkedConditionExists) {
          issues.push({
            path: `${historyPath}/new_condition_evidence_ids`,
            code: "new_condition_code_evidence_mismatch",
            message:
              "Scenario-compatible condition_code должен быть связан с тем же current evidence ID у confirmed_true atomic fact из versioned material-condition mapping.",
          });
        }
      }
    }

    if (history.history_status === "not_reported") {
      if (history.new_material_condition !== "not_applicable") {
        issues.push({ path: `${historyPath}/new_material_condition`, code: "not_reported_is_not_not_tried", message: "not_reported означает отсутствие сведений, поэтому новое условие — not_applicable." });
      }
      if (history.evidence_ids.length > 0) {
        issues.push({ path: `${historyPath}/evidence_ids`, code: "not_reported_with_attempt_evidence", message: "Для not_reported evidence_ids должны быть пустыми." });
      }
      if (history.new_condition_evidence_ids.length > 0) {
        issues.push({ path: `${historyPath}/new_condition_evidence_ids`, code: "not_reported_with_new_condition_evidence", message: "Для not_reported new_condition_evidence_ids должны быть пустыми." });
      }
      if (history.condition_codes.length > 0) {
        issues.push({ path: `${historyPath}/condition_codes`, code: "not_reported_with_condition_codes", message: "Для not_reported condition_codes должны быть пустыми." });
      }
      return;
    }

    if (history.history_status === "worked_sustained") {
      if (history.evidence_ids.length === 0) {
        issues.push({ path: `${historyPath}/evidence_ids`, code: "worked_sustained_without_attempt_evidence", message: "worked_sustained требует evidence попытки/результата." });
      }
      if (history.new_material_condition !== "not_applicable") {
        issues.push({ path: `${historyPath}/new_material_condition`, code: "worked_sustained_with_material_condition", message: "Для worked_sustained новое условие не применяется." });
      }
      if (history.new_condition_evidence_ids.length > 0) {
        issues.push({ path: `${historyPath}/new_condition_evidence_ids`, code: "worked_sustained_with_new_condition_evidence", message: "Для worked_sustained new_condition_evidence_ids должны быть пустыми." });
      }
      if (history.condition_codes.length > 0) {
        issues.push({ path: `${historyPath}/condition_codes`, code: "worked_sustained_with_condition_codes", message: "Для worked_sustained condition_codes должны быть пустыми." });
      }
      return;
    }

    if (
      history.history_status === "worked_temporarily" ||
      history.history_status === "tried_no_sustained_result"
    ) {
      if (history.evidence_ids.length === 0) {
        issues.push({ path: `${historyPath}/evidence_ids`, code: "attempt_history_without_evidence", message: `${history.history_status} требует evidence попытки.` });
      }
      if (history.new_material_condition === "not_applicable") {
        issues.push({ path: `${historyPath}/new_material_condition`, code: "attempt_history_material_condition_not_applicable", message: `${history.history_status} допускает только yes/no/unknown.` });
      }
      return;
    }

    if (history.history_status === "unclear") {
      if (history.evidence_ids.length === 0) {
        issues.push({ path: `${historyPath}/evidence_ids`, code: "unclear_without_attempt_evidence", message: "unclear требует evidence факта попытки." });
      }
      if (history.new_material_condition !== "unknown") {
        issues.push({ path: `${historyPath}/new_material_condition`, code: "unclear_material_condition_must_be_unknown", message: "Для unclear new_material_condition обязан быть unknown." });
      }
    }
  });

  if (issues.length > 0) throw new P01InvariantError(issues);
  return result;
}

export function p01SanityErrors(result: P01ResultV1_4_1): P01ValidationIssue[] {
  return result.sanityChecks
    .filter((check) => check.severity === "error")
    .map((check, index) => ({
      path: `/sanityChecks/${index}`,
      code: `sanity.${check.code}`,
      message: check.message,
    }));
}

export const P01_OUTPUT_SCHEMA = p01OutputSchema as Record<string, unknown>;
