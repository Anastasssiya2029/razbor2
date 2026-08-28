import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import analysisResultSchema from "@/schemas/analysis-result.v1.schema.json";
import { stableJson } from "@/server/stage4/hash";
import { AnalysisResultError } from "./errors";
import { ANALYSIS_RESULT_VERSIONS, type AnalysisResultV1 } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(analysisResultSchema);

const LEGACY_ANALYSIS_RESULT_VERSIONS = {
  ...ANALYSIS_RESULT_VERSIONS,
  archetypes: "archetypes.v1",
  transitions: "transitions-70.v1",
} as const;

function schemaMessage(error: ErrorObject): string {
  return `${error.instancePath || "/"}: ${error.message ?? error.keyword}`;
}

function findForbiddenKey(value: unknown, path = "$"): string | null {
  const forbidden = new Set([
    "rawAnswers",
    "rawAnswersJson",
    "rawPayload",
    "normalizedInput",
    "normalizedInputJson",
    "providerRawResponse",
    "providerRawResponseJson",
    "apiKey",
    "authorization",
    "secret",
    "token",
    "candidateTrace",
    "rankingTrace",
    "selectorInput",
  ]);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (forbidden.has(key)) return `${path}.${key}`;
    const found = findForbiddenKey(nested, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

export function validateAnalysisResult(value: unknown): AnalysisResultV1 {
  if (!validateSchema(value)) {
    throw new AnalysisResultError(
      "ANALYSIS_RESULT_SCHEMA_INVALID",
      (validateSchema.errors ?? []).map(schemaMessage).join("; "),
      "validation",
    );
  }
  const result = value as AnalysisResultV1;
  if (stableJson(result.versions) !== stableJson(ANALYSIS_RESULT_VERSIONS)) {
    throw new AnalysisResultError("ANALYSIS_RESULT_VERSION_MANIFEST_CHANGED", "Final result version manifest is not canonical.", "version_conflict");
  }
  const taskIds = result.route.cards.flatMap((card) => card.tasks.map((task) => task.taskId));
  if (stableJson(taskIds) !== stableJson(result.route.taskIds) || taskIds.length !== result.route.totalTasks) {
    throw new AnalysisResultError("ANALYSIS_RESULT_ROUTE_CHANGED", "Final route task IDs/count differ from the immutable resolver plan.", "integrity");
  }
  const firstTask = result.route.cards[0]?.tasks[0];
  if (!firstTask || result.finalFocus.first_task_id !== firstTask.taskId || result.finalFocus.first_action !== firstTask.task) {
    throw new AnalysisResultError("ANALYSIS_RESULT_FIRST_ACTION_CHANGED", "Final focus must echo the first fixed transition task exactly.", "integrity");
  }
  if (stableJson(result.report.finalFocus) !== stableJson(result.finalFocus)) {
    throw new AnalysisResultError("ANALYSIS_RESULT_REPORT_FOCUS_CHANGED", "Final focus must be the exact persisted P-04 projection.", "integrity");
  }
  if (stableJson(result.report.moneyNow) !== stableJson(result.moneyNow.narrative)) {
    throw new AnalysisResultError("ANALYSIS_RESULT_MONEY_NARRATIVE_CHANGED", "Money Now narrative must be the exact persisted P-04 projection.", "integrity");
  }
  if (result.moneyNow.status === "no_eligible_scenario") {
    if (result.moneyNow.selectionStatus !== "no_eligible_scenario" || result.moneyNow.selectedScenario !== null || result.moneyNow.prescription !== null || result.moneyNow.skippedOutcome === null) {
      throw new AnalysisResultError("ANALYSIS_RESULT_NO_ELIGIBLE_FALLBACK", "No-eligible result cannot contain a fallback scenario or prescription.", "integrity");
    }
  } else if (result.moneyNow.selectionStatus !== "selected" || result.moneyNow.selectedScenario === null || result.moneyNow.prescription === null || result.moneyNow.skippedOutcome !== null) {
    throw new AnalysisResultError("ANALYSIS_RESULT_MONEY_NOW_STATE_INVALID", "Selected Money Now status requires the immutable scenario and persisted P-03 outcome.", "integrity");
  }
  const forbidden = findForbiddenKey(result);
  if (forbidden) {
    throw new AnalysisResultError("ANALYSIS_RESULT_FORBIDDEN_DATA", `Final result contains forbidden server-only data at ${forbidden}.`, "integrity");
  }
  return result;
}

/**
 * Уже выданный клиенту результат остаётся читаемым после обновления
 * справочников. Для проверки структуры временно нормализуются только три
 * явно версионированных поля; сам сохранённый результат не переписывается.
 */
export function validateReadableAnalysisResult(value: unknown): AnalysisResultV1 {
  if (
    value &&
    typeof value === "object" &&
    stableJson((value as { versions?: unknown }).versions) === stableJson(ANALYSIS_RESULT_VERSIONS)
  ) {
    return validateAnalysisResult(value);
  }
  if (
    !value ||
    typeof value !== "object" ||
    stableJson((value as { versions?: unknown }).versions) !== stableJson(LEGACY_ANALYSIS_RESULT_VERSIONS)
  ) {
    throw new AnalysisResultError(
      "ANALYSIS_RESULT_VERSION_MANIFEST_CHANGED",
      "Final result version manifest is neither current nor an approved historical version.",
      "version_conflict",
    );
  }

  const historical = value as AnalysisResultV1 & {
    route?: { transitionRegistryVersion?: string };
  };
  if (historical.route?.transitionRegistryVersion !== "transitions-70.v1") {
    throw new AnalysisResultError(
      "ANALYSIS_RESULT_HISTORICAL_ROUTE_VERSION_CHANGED",
      "Historical final result has an unsupported transition registry version.",
      "version_conflict",
    );
  }

  const normalized = structuredClone(value) as AnalysisResultV1;
  (normalized as { versions: unknown }).versions = ANALYSIS_RESULT_VERSIONS;
  (normalized.route as { transitionRegistryVersion: string }).transitionRegistryVersion = "transitions-70.v2";
  validateAnalysisResult(normalized);
  return value as AnalysisResultV1;
}

export const ANALYSIS_RESULT_SCHEMA = analysisResultSchema as Record<string, unknown>;
