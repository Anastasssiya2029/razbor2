import { assertDiagnosticInputForAi, type DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import { EVIDENCE_ROUTING_RESOURCE_VERSION } from "@/server/7k/config/evidence-routing.v3.0";
import { MONEY_NOW_HISTORY_MAP_RESOURCE_VERSION } from "@/server/7k/config/money-now-history-map.v2.2";
import { SCORING_RULES_RESOURCE_VERSION } from "@/server/7k/config/scoring-rules.v2.0";
import { TARGET_MODEL_DICTIONARY_RESOURCE_VERSION } from "@/server/7k/config/target-model-dictionary.v2.1";
import { P01_PROMPT_VERSION } from "@/server/7k/prompts/p01.v1.3";
import { createConfiguredP01Provider } from "./provider";
import { buildP01SystemPrompt } from "./request";
import type {
  P01Provider,
  P01ProviderUsage,
  P01RunMetadata,
  P01RunOutcome,
  RunP01Options,
} from "./types";
import { P01_OUTPUT_SCHEMA_VERSION } from "./types";
import {
  P01InvariantError,
  P01SchemaValidationError,
  P01_OUTPUT_SCHEMA,
  p01SanityErrors,
  validateP01Invariants,
  validateP01Schema,
  type P01ValidationIssue,
} from "./validation";

export type P01FailureCode =
  | "P01_PROVIDER_CONFIGURATION_ERROR"
  | "P01_TRANSPORT_ERROR"
  | "P01_MALFORMED_JSON"
  | "P01_SCHEMA_VALIDATION_FAILED"
  | "P01_INVARIANT_FAILED"
  | "P01_SANITY_ERROR";

export class P01RunExecutionError extends Error {
  readonly failureCode: P01FailureCode;
  readonly metadata: P01RunMetadata;
  readonly providerRawResponse: unknown;

  constructor(options: {
    failureCode: P01FailureCode;
    message: string;
    metadata: P01RunMetadata;
    providerRawResponse: unknown;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "P01RunExecutionError";
    this.failureCode = options.failureCode;
    this.metadata = options.metadata;
    this.providerRawResponse = options.providerRawResponse;
  }
}

const P01_RULE_VERSIONS = {
  scoringRules: SCORING_RULES_RESOURCE_VERSION,
  evidenceRouting: EVIDENCE_ROUTING_RESOURCE_VERSION,
  targetModelDictionary: TARGET_MODEL_DICTIONARY_RESOURCE_VERSION,
  moneyNowHistoryMap: MONEY_NOW_HISTORY_MAP_RESOURCE_VERSION,
} as const;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function hashDiagnosticInput(input: DiagnosticInputV1_2): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function emptyUsage(): P01ProviderUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };
}

function addUsage(total: P01ProviderUsage, next: P01ProviderUsage): void {
  const add = (left: number | null, right: number | null): number | null => {
    if (left === null && right === null) return null;
    return (left ?? 0) + (right ?? 0);
  };
  total.inputTokens = add(total.inputTokens, next.inputTokens);
  total.outputTokens = add(total.outputTokens, next.outputTokens);
  total.totalTokens = add(total.totalTokens, next.totalTokens);
  total.costUsd = add(total.costUsd, next.costUsd);
}

function issuesCorrection(kind: string, issues: readonly P01ValidationIssue[]): string {
  return [
    `${kind}:`,
    ...issues.slice(0, 20).map((issue) => `- ${issue.path}: ${issue.code}: ${issue.message}`),
    "Верни весь JSON заново строго по исходной schema v1.3; не меняй факты без необходимости исправить указанное противоречие.",
  ].join("\n");
}

async function defaultProvider(): Promise<P01Provider> {
  const { env } = await import("cloudflare:workers");
  return createConfiguredP01Provider(env as unknown as Record<string, string | undefined>);
}

function parseJson(text: string): unknown {
  return JSON.parse(text);
}

export async function runP01EvidenceScorer(
  input: DiagnosticInputV1_2,
  options: RunP01Options = {},
): Promise<P01RunOutcome> {
  const normalizedInput = assertDiagnosticInputForAi(input);
  const now = options.now ?? (() => new Date());
  const startedAtDate = now();
  const inputHash = await (options.hashInput ?? hashDiagnosticInput)(normalizedInput);
  let provider: P01Provider;
  try {
    provider = options.provider ?? (await defaultProvider());
  } catch (error) {
    const finishedAt = now();
    const metadata = createMetadata({
      provider: "unconfigured",
      model: "unconfigured",
      inputHash,
      startedAtDate,
      finishedAt,
      technicalRetryCount: 0,
      reevaluationRetryCount: 0,
      usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null },
    });
    throw new P01RunExecutionError({
      failureCode: "P01_PROVIDER_CONFIGURATION_ERROR",
      message: error instanceof Error ? error.message : "P-01 provider is not configured",
      metadata,
      providerRawResponse: null,
      cause: error,
    });
  }

  let technicalRetryCount = 0;
  let reevaluationRetryCount = 0;
  let correction: string | null = null;
  let latestRaw: unknown = null;
  const usage = emptyUsage();

  while (true) {
    let response;
    try {
      response = await provider.complete({
        systemPrompt: buildP01SystemPrompt(normalizedInput, correction),
        outputSchema: P01_OUTPUT_SCHEMA,
        correction,
      });
      latestRaw = response.rawResponse;
      addUsage(usage, response.usage);
    } catch (error) {
      if (technicalRetryCount === 0) {
        technicalRetryCount += 1;
        correction = null;
        continue;
      }
      throw executionError("P01_TRANSPORT_ERROR", error, "P-01 provider transport failed", latestRaw);
    }

    let parsed: unknown;
    try {
      parsed = parseJson(response.text);
    } catch (error) {
      if (technicalRetryCount === 0) {
        technicalRetryCount += 1;
        correction = "Предыдущий ответ не был валидным JSON. Верни только JSON по schema v1.3 без Markdown и code fences.";
        continue;
      }
      throw executionError("P01_MALFORMED_JSON", error, "P-01 returned malformed JSON", latestRaw);
    }

    let result;
    try {
      result = validateP01Schema(parsed);
    } catch (error) {
      if (error instanceof P01SchemaValidationError && technicalRetryCount === 0) {
        technicalRetryCount += 1;
        correction = issuesCorrection("Нарушена JSON Schema", error.issues);
        continue;
      }
      throw executionError("P01_SCHEMA_VALIDATION_FAILED", error, "P-01 output schema validation failed", latestRaw);
    }

    try {
      validateP01Invariants(result);
    } catch (error) {
      if (error instanceof P01InvariantError && reevaluationRetryCount === 0) {
        reevaluationRetryCount += 1;
        correction = issuesCorrection("Нарушены backend invariants", error.issues);
        continue;
      }
      throw executionError("P01_INVARIANT_FAILED", error, "P-01 semantic invariants failed", latestRaw);
    }

    const sanityErrors = p01SanityErrors(result);
    if (sanityErrors.length > 0) {
      if (reevaluationRetryCount === 0) {
        reevaluationRetryCount += 1;
        correction = issuesCorrection("Sanity check severity=error", sanityErrors);
        continue;
      }
      throw executionError("P01_SANITY_ERROR", new Error(sanityErrors.map((issue) => issue.message).join("; ")), "P-01 sanity checks failed", latestRaw);
    }

    const finishedAt = now();
    const metadata = createMetadata({
      provider: provider.provider,
      model: provider.model,
      inputHash,
      startedAtDate,
      finishedAt,
      technicalRetryCount,
      reevaluationRetryCount,
      usage,
    });
    if (result.analysisStatus === "blocked_by_insufficient_data") {
      return {
        kind: "blocked",
        result,
        failureCode: "P01_BLOCKED_INSUFFICIENT_DATA",
        failureMessage: "P-01 заблокирован из-за недостатка доказательств; повтор ради заполнения запрещён.",
        metadata,
        providerRawResponse: latestRaw,
      };
    }
    if (result.analysisStatus === "blocked_by_inconsistency") {
      return {
        kind: "blocked",
        result,
        failureCode: "P01_BLOCKED_INCONSISTENCY",
        failureMessage: "P-01 заблокирован из-за неразрешённого противоречия во входных данных.",
        metadata,
        providerRawResponse: latestRaw,
      };
    }
    return { kind: "success", result, metadata, providerRawResponse: latestRaw };
  }

  function executionError(
    failureCode: P01FailureCode,
    cause: unknown,
    message: string,
    providerRawResponse: unknown,
  ): P01RunExecutionError {
    const finishedAt = now();
    return new P01RunExecutionError({
      failureCode,
      message,
      metadata: createMetadata({
        provider: provider.provider,
        model: provider.model,
        inputHash,
        startedAtDate,
        finishedAt,
        technicalRetryCount,
        reevaluationRetryCount,
        usage,
      }),
      providerRawResponse,
      cause,
    });
  }
}

function createMetadata(options: {
  provider: string;
  model: string;
  inputHash: string;
  startedAtDate: Date;
  finishedAt: Date;
  technicalRetryCount: number;
  reevaluationRetryCount: number;
  usage: P01ProviderUsage;
}): P01RunMetadata {
  return {
    provider: options.provider,
    model: options.model,
    promptVersion: P01_PROMPT_VERSION,
    outputSchemaVersion: P01_OUTPUT_SCHEMA_VERSION,
    ruleVersions: P01_RULE_VERSIONS,
    inputHash: options.inputHash,
    startedAt: options.startedAtDate.toISOString(),
    finishedAt: options.finishedAt.toISOString(),
    latencyMs: Math.max(0, options.finishedAt.getTime() - options.startedAtDate.getTime()),
    retryCount: options.technicalRetryCount + options.reevaluationRetryCount,
    technicalRetryCount: options.technicalRetryCount,
    reevaluationRetryCount: options.reevaluationRetryCount,
    usage: options.usage,
  };
}

