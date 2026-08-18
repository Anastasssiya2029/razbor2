import {
  calculateBusinessArchetype,
  calculateTargetConfiguration,
  validateSevenKScores,
} from "@/server/7k";
import { SEVEN_K_ELEMENT_IDS } from "@/server/7k/types";
import { Stage4Error } from "./errors";
import { stableJson } from "./hash";
import type { TargetArchetypeComputation } from "./types";

function containsLegacyId(value: unknown): boolean {
  if (value === "products_method") return true;
  if (Array.isArray(value)) return value.some(containsLegacyId);
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => key === "products_method" || containsLegacyId(nested),
    );
  }
  return false;
}

export function validateTargetArchetypeComputation(
  computation: TargetArchetypeComputation,
): TargetArchetypeComputation {
  const issues: Array<{ code: string; message: string }> = [];
  try {
    validateSevenKScores(computation.currentScores, "/currentScores");
    validateSevenKScores(computation.target.requiredMinimum, "/target/requiredMinimum");
    validateSevenKScores(computation.target.targetScores, "/target/targetScores");
    validateSevenKScores(computation.target.gap, "/target/gap");
  } catch (error) {
    issues.push({
      code: "INVALID_SEVEN_K_SCORES",
      message: error instanceof Error ? error.message : "Invalid 7K scores.",
    });
  }

  for (const elementId of SEVEN_K_ELEMENT_IDS) {
    const current = computation.currentScores[elementId];
    const required = computation.target.requiredMinimum[elementId];
    const target = computation.target.targetScores[elementId];
    const gap = computation.target.gap[elementId];
    if (target < current) {
      issues.push({ code: "TARGET_BELOW_CURRENT", message: `${elementId}: ${target} < ${current}.` });
    }
    if (target < required) {
      issues.push({ code: "TARGET_BELOW_REQUIRED", message: `${elementId}: ${target} < ${required}.` });
    }
    if (gap !== target - current || gap < 0) {
      issues.push({ code: "INVALID_GAP", message: `${elementId}: gap=${gap}, expected ${target - current}.` });
    }
  }

  const expectedTarget = calculateTargetConfiguration(computation.targetInput);
  if (stableJson(expectedTarget) !== stableJson(computation.target)) {
    issues.push({
      code: "TARGET_RESULT_NOT_REPRODUCIBLE",
      message: "Target result does not match target-rules.v2.1 pure function output.",
    });
  }

  const expectedArchetype = calculateBusinessArchetype(computation.currentScores);
  if (stableJson(expectedArchetype) !== stableJson(computation.archetype)) {
    issues.push({
      code: "ARCHETYPE_RESULT_NOT_REPRODUCIBLE",
      message: "Archetype result does not match archetypes.v1 pure function output.",
    });
  }
  const expectedTotal = SEVEN_K_ELEMENT_IDS.reduce(
    (total, elementId) => total + computation.currentScores[elementId],
    0,
  );
  if (computation.archetype.totalScore !== expectedTotal) {
    issues.push({
      code: "INVALID_ARCHETYPE_TOTAL",
      message: `Archetype total=${computation.archetype.totalScore}, expected ${expectedTotal}.`,
    });
  }
  if (containsLegacyId(computation)) {
    issues.push({
      code: "LEGACY_ELEMENT_ID",
      message: "products_method is forbidden in Target/Archetype stage.",
    });
  }
  if (
    computation.target.resourceVersion !== computation.resourceVersions.targetRules ||
    computation.archetype.resourceVersion !== computation.resourceVersions.archetypes
  ) {
    issues.push({
      code: "RESOURCE_VERSION_MISMATCH",
      message: "Result resource versions do not match the persisted stage snapshot.",
    });
  }

  if (issues.length > 0) {
    throw new Stage4Error(
      "STAGE4_INVARIANT_ERROR",
      issues.map((issue) => `${issue.code}: ${issue.message}`).join("; "),
      "validation",
      { issues },
    );
  }
  return computation;
}

