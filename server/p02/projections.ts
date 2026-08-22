import { ELEMENTS_RESOURCE_VERSION } from "@/server/7k/config/elements.v1";
import {
  CONSTRAINT_RULES_RESOURCE_VERSION,
  DEPENDENCY_RULES_RESOURCE_VERSION,
  LEVEL_CAPABILITIES_RESOURCE_VERSION,
} from "@/server/7k/config/p02-strategy-rules.v2.1";
import { TARGET_RULES_RESOURCE_VERSION, type DesiredOwnerRole, type TargetModifierCode } from "@/server/7k/config/target-rules.v2.2";
import { SEVEN_K_ELEMENT_IDS, type SevenKScores } from "@/server/7k/types";
import type { P01ResultV1_4_2 } from "@/server/p01/types";
import type { StoredTargetArchetypeResult } from "@/server/stage4/types";
import { validateP01Invariants, validateP01Schema } from "@/server/p01/validation";
import { P02Error } from "./errors";
import type { P01StrategyContext, P02RuleVersions, TargetConfigProjection } from "./types";

export const P02_RULE_VERSIONS: P02RuleVersions = {
  elements: ELEMENTS_RESOURCE_VERSION,
  levelCapabilities: LEVEL_CAPABILITIES_RESOURCE_VERSION,
  constraintRules: CONSTRAINT_RULES_RESOURCE_VERSION,
  dependencyRules: DEPENDENCY_RULES_RESOURCE_VERSION,
  targetRules: TARGET_RULES_RESOURCE_VERSION,
};

export type P02UpstreamSource = {
  analysisRunId: string;
  diagnosticId: string;
  runStatus: string;
  p01AnalysisResultId: string | null;
  p01PromptVersion: string | null;
  p01OutputSchemaVersion: string | null;
  p01InputHash: string | null;
  p01Result: P01ResultV1_4_2 | null;
  p01FailureCode: string | null;
  targetStage: Pick<
    StoredTargetArchetypeResult,
    | "id"
    | "diagnosticId"
    | "analysisRunId"
    | "p01AnalysisResultId"
    | "p01InputHash"
    | "p01ResultHash"
    | "currentScores"
    | "target"
    | "resourceVersions"
    | "deterministicInputHash"
    | "failureCode"
    | "failureMessage"
  > | null;
};

export type P02PreparedInput = {
  strategyContext: P01StrategyContext;
  targetConfig: TargetConfigProjection;
  currentScores: SevenKScores;
  ruleVersions: P02RuleVersions;
};

function containsLegacyId(value: unknown): boolean {
  if (value === "products_method") return true;
  if (Array.isArray(value)) return value.some(containsLegacyId);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => key === "products_method" || containsLegacyId(nested),
    );
  }
  return false;
}

function currentScores(p01: P01ResultV1_4_2): SevenKScores {
  const scores = Object.fromEntries(
    SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, p01.current7k[elementId].score]),
  ) as Record<string, number | null>;
  const missing = SEVEN_K_ELEMENT_IDS.filter((elementId) => !Number.isInteger(scores[elementId]));
  if (missing.length) {
    throw new P02Error("P02_CURRENT_SCORES_INCOMPLETE", `P-01 current scores are incomplete: ${missing.join(", ")}.`, "upstream_blocked");
  }
  return scores as SevenKScores;
}

type ExplicitRoleRule = {
  role: DesiredOwnerRole;
  modifier: TargetModifierCode | null;
  pattern: RegExp;
};

const EXPLICIT_ROLE_RULES: readonly ExplicitRoleRule[] = [
  { role: "autonomous_owner", modifier: "autonomous_business", pattern: /(?:полностью\s+автономн|бизнес\s+без\s+(?:моего|личного)\s+участия|не\s+участвовать\s+в\s+операцион)/iu },
  { role: "manage_through_leaders", modifier: "manage_only_through_heads", pattern: /управля(?:ть|ю)\s+(?:только\s+)?через\s+руководител/iu },
  { role: "exit_sales_management", modifier: "exit_sales_management", pattern: /(?:полностью\s+выйти\s+из\s+(?:управления\s+)?продаж|не\s+управлять\s+продаж)/iu },
  { role: "delegate_sales", modifier: "delegate_individual_sales", pattern: /(?:передать|делегировать)\s+(?:личные\s+|индивидуальные\s+)?продаж/iu },
  { role: "personal_premium_sales", modifier: "personally_sell_high_ticket", pattern: /лично\s+продавать\s+(?:дорог|премиальн|high.?ticket)/iu },
];

export function assertDesiredRoleConsistency(
  desiredRoleSummary: string | null,
  target: TargetConfigProjection,
): void {
  if (!desiredRoleSummary?.trim()) return;
  const explicit = EXPLICIT_ROLE_RULES.find((rule) => rule.pattern.test(desiredRoleSummary));
  if (!explicit) return;
  const modifierPresent = explicit.modifier === null || target.appliedModifiers.includes(explicit.modifier);
  const roleMatches = target.desiredOwnerRole === explicit.role;
  if (!modifierPresent || !roleMatches) {
    throw new P02Error(
      "TARGET_CONFIG_INCONSISTENCY",
      `desiredRoleSummary explicitly requires ${explicit.role}, but persisted Target Configuration does not contain the matching canonical role/modifier.`,
      "validation",
      { desiredOwnerRole: target.desiredOwnerRole, requiredRole: explicit.role, requiredModifier: explicit.modifier },
    );
  }
}

export function prepareP02Input(source: P02UpstreamSource): P02PreparedInput {
  if (source.p01PromptVersion !== "P-01.v1.4.2" || source.p01OutputSchemaVersion !== "1.4") {
    throw new P02Error("P02_UNSUPPORTED_P01_VERSION", "P-02 supports only persisted P-01.v1.4.2/schema 1.4.", "upstream_blocked");
  }
  if (!source.p01Result) {
    throw new P02Error("P02_P01_RESULT_MISSING", source.p01FailureCode ?? "Persisted P-01 result is missing.", "upstream_blocked");
  }
  try {
    validateP01Invariants(validateP01Schema(source.p01Result));
  } catch (error) {
    throw new P02Error("P02_P01_INVALID", error instanceof Error ? error.message : "Persisted P-01 is invalid.", "upstream_blocked");
  }
  if (!(["ok", "low_confidence"] as const).includes(source.p01Result.analysisStatus as "ok" | "low_confidence")) {
    throw new P02Error("P02_P01_BLOCKED", `P-01 status=${source.p01Result.analysisStatus}.`, "upstream_blocked");
  }
  const stage4 = source.targetStage;
  if (!stage4 || stage4.failureCode || !stage4.target || !stage4.currentScores) {
    throw new P02Error("P02_TARGET_RESULT_MISSING", stage4?.failureMessage ?? "Persisted deterministic Target Configuration is required.", "upstream_blocked");
  }
  if (stage4.resourceVersions.targetRules !== "target-rules.v2.2" || stage4.target.resourceVersion !== "target-rules.v2.2") {
    throw new P02Error("P02_UNSUPPORTED_TARGET_VERSION", "P-02 requires target-rules.v2.2.", "upstream_blocked");
  }
  if (stage4.p01AnalysisResultId !== source.p01AnalysisResultId) {
    throw new P02Error("P02_UPSTREAM_VERSION_CONFLICT", "Stage 4 is linked to a different P-01 result.", "version_conflict");
  }
  const p01Scores = currentScores(source.p01Result);
  for (const elementId of SEVEN_K_ELEMENT_IDS) {
    if (stage4.currentScores[elementId] !== p01Scores[elementId]) {
      throw new P02Error("CURRENT_SCORE_INCONSISTENCY", `${elementId}: Stage 4 current snapshot differs from P-01.`, "validation");
    }
    if (stage4.target.targetScores[elementId] < p01Scores[elementId]) {
      throw new P02Error("TARGET_CONFIG_INCONSISTENCY", `${elementId}: target is below current.`, "validation");
    }
  }
  const strategyContext: P01StrategyContext = {
    evidenceLedger: source.p01Result.evidenceLedger,
    current7k: source.p01Result.current7k,
    businessMap: source.p01Result.businessMap,
    moneyChainFacts: source.p01Result.moneyChainFacts,
    desiredRoleSummary: source.p01Result.targetIntent.desiredRoleSummary,
    desiredSystemWeeklyHours: source.p01Result.targetIntent.desiredSystemWeeklyHours,
  };
  const targetConfig: TargetConfigProjection = {
    modelFamily: stage4.target.modelFamily,
    modelComponents: stage4.target.modelComponents,
    requiredMinimum: stage4.target.requiredMinimum,
    targetScores: stage4.target.targetScores,
    gap: stage4.target.gap,
    capabilities: stage4.target.capabilities,
    appliedModifiers: stage4.target.appliedModifiers,
    desiredOwnerRole: stage4.target.desiredOwnerRole,
  };
  assertDesiredRoleConsistency(strategyContext.desiredRoleSummary, targetConfig);
  if (containsLegacyId(strategyContext) || containsLegacyId(targetConfig)) {
    throw new P02Error("P02_LEGACY_ELEMENT_ID", "products_method is forbidden in P-02.", "validation");
  }
  return { strategyContext, targetConfig, currentScores: p01Scores, ruleVersions: P02_RULE_VERSIONS };
}
