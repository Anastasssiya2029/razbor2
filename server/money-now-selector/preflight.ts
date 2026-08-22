import {
  MONEY_NOW_SELECTOR_CONTRACT_VERSION,
  assertMoneyNowSelectorContractIntegrity,
} from "@/server/7k/config/money-now-selector-contract.v1";
import { MONEY_NOW_FACT_EXTRACTION_VERSION } from "@/server/7k/config/money-now-fact-extraction.v1";
import { MONEY_NOW_RESOURCE_VERSION } from "@/server/7k/config/money-now.v2.2";
import { buildMoneyNowHistoryGuardInput } from "@/server/p01/money-now-history-adapter";
import { validateP01Invariants, validateP01Schema } from "@/server/p01/validation";
import { sha256 } from "@/server/stage4/hash";
import {
  MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256,
  MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256,
  MONEY_NOW_SELECTOR_STAGE_VERSION,
  type MoneyNowSelectorSource,
  type PreparedMoneyNowSelectorInput,
} from "./types";
import { MoneyNowSelectorStageError } from "./errors";

function containsLegacyProductId(value: unknown): boolean {
  if (value === "products_method") return true;
  if (Array.isArray(value)) return value.some(containsLegacyProductId);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => key === "products_method" || containsLegacyProductId(nested),
    );
  }
  return false;
}

export async function moneyNowSelectorSourceSnapshot(source: MoneyNowSelectorSource): Promise<{
  p01ResultHash: string | null;
  deterministicInputHash: string;
}> {
  const p01ResultHash = source.p01.result ? await sha256(source.p01.result) : null;
  const deterministicInputHash = await sha256({
    p01AnalysisResultId: source.p01.id,
    p01ResultHash,
    stageVersion: MONEY_NOW_SELECTOR_STAGE_VERSION,
    selectorContractVersion: MONEY_NOW_SELECTOR_CONTRACT_VERSION,
    selectorContractJsonSha256: MONEY_NOW_SELECTOR_CONTRACT_JSON_SHA256,
    selectorContractTsSha256: MONEY_NOW_SELECTOR_CONTRACT_TS_SHA256,
    businessMethodologyVersion: MONEY_NOW_RESOURCE_VERSION,
    factExtractionVersion: MONEY_NOW_FACT_EXTRACTION_VERSION,
  });
  return { p01ResultHash, deterministicInputHash };
}

export async function prepareMoneyNowSelectorInput(
  source: MoneyNowSelectorSource,
): Promise<PreparedMoneyNowSelectorInput> {
  if (source.runStatus !== "money_now") {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_NOT_READY",
      `Analysis run status=${source.runStatus}; expected money_now.`,
      "validation",
    );
  }
  const p01 = source.p01;
  if (!p01.id || !p01.result || p01.failureCode) {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_P01_MISSING",
      "A successful persisted P-01 result is required.",
      "upstream_blocked",
    );
  }
  if (p01.promptVersion !== "P-01.v1.4.2" || p01.outputSchemaVersion !== "1.4") {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_UNSUPPORTED_P01_VERSION",
      "Money Now Selector accepts only persisted P-01.v1.4.2/schema 1.4.",
      "upstream_blocked",
    );
  }
  if (!(p01.result.analysisStatus === "ok" || p01.result.analysisStatus === "low_confidence")) {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_P01_BLOCKED",
      `P-01 analysisStatus=${p01.result.analysisStatus} cannot enter Stage 7.`,
      "upstream_blocked",
    );
  }
  try {
    validateP01Invariants(validateP01Schema(p01.result));
  } catch (error) {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_P01_INVALID",
      error instanceof Error ? error.message : "Persisted P-01 failed validation.",
      "integrity",
    );
  }
  if (containsLegacyProductId(p01.result)) {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_LEGACY_ELEMENT_ID",
      "products_method is forbidden in the Stage 7 pipeline; use product_method only.",
      "validation",
    );
  }
  const taskResolver = source.taskResolver;
  if (!taskResolver || taskResolver.failureCode || !taskResolver.plan) {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_TASK_RESOLVER_MISSING",
      taskResolver?.failureMessage ?? "A successful persisted Task Resolver plan is required as lifecycle dependency.",
      "upstream_blocked",
    );
  }
  if (
    taskResolver.stageVersion !== "task-resolver-stage.v1" ||
    taskResolver.transitionRegistryVersion !== "transitions-70.v1"
  ) {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_TASK_RESOLVER_VERSION_UNSUPPORTED",
      "Stage 7 requires task-resolver-stage.v1 and transitions-70.v1.",
      "upstream_blocked",
    );
  }
  if (taskResolver.p01AnalysisResultId !== p01.id) {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_UPSTREAM_SNAPSHOT_CONFLICT",
      "Task Resolver and P-01 are not linked to the same persisted snapshot.",
      "validation",
    );
  }
  if (
    MONEY_NOW_SELECTOR_CONTRACT_VERSION !== "money-now-selector-contract.v1.2" ||
    MONEY_NOW_RESOURCE_VERSION !== "money-now.v2.2" ||
    MONEY_NOW_FACT_EXTRACTION_VERSION !== "money-now-fact-extraction.v1"
  ) {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_RESOURCE_VERSION_MISMATCH",
      "Stage 7 resource version mismatch.",
      "integrity",
    );
  }
  try {
    assertMoneyNowSelectorContractIntegrity();
  } catch (error) {
    throw new MoneyNowSelectorStageError(
      "MONEY_NOW_SELECTOR_CONTRACT_INTEGRITY_FAILED",
      error instanceof Error ? error.message : "Selector contract failed integrity validation.",
      "integrity",
    );
  }
  const selectorInput = {
    facts: structuredClone(p01.result.moneyNowFacts),
    history: buildMoneyNowHistoryGuardInput(p01.result.moneyNowHistory),
    evidenceLedger: structuredClone(p01.result.evidenceLedger),
  };
  const selectorInputHash = await sha256(selectorInput);
  const sourceSnapshot = await moneyNowSelectorSourceSnapshot(source);
  return {
    selectorInput,
    p01AnalysisResultId: p01.id,
    p01ResultHash: sourceSnapshot.p01ResultHash!,
    taskResolverPlanId: taskResolver.id,
    taskResolverPlanHash: await sha256(taskResolver.plan),
    selectorInputHash,
    deterministicInputHash: sourceSnapshot.deterministicInputHash,
  };
}
