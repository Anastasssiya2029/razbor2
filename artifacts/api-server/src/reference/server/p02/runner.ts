import { P02_PROMPT_VERSION } from "@/server/7k/prompts/p02.v1.3";
import { parseProviderJson } from "@/server/ai/provider-json";
import { sha256 } from "@/server/stage4/hash";
import { createConfiguredP02Provider } from "./provider";
import { buildP02SystemPrompt } from "./request";
import type {
  P01StrategyContext,
  P02Provider,
  P02RunMetadata,
  P02RunOutcome,
  P02RuleVersions,
  TargetConfigProjection,
} from "./types";
import { P02_OUTPUT_SCHEMA_VERSION } from "./types";
import {
  P02InvariantError,
  P02SchemaValidationError,
  P02_OUTPUT_SCHEMA,
  normalizeP02CanonicalFields,
  validateP02Invariants,
  validateP02Schema,
  type P02ValidationIssue,
} from "./validation";
import type { SevenKScores } from "@/server/7k/types";
import type { AiProviderUsage } from "@/server/ai/openrouter-json";

export type P02FailureCode =
  | "P02_PROVIDER_CONFIGURATION_ERROR"
  | "P02_TRANSPORT_ERROR"
  | "P02_MALFORMED_JSON"
  | "P02_SCHEMA_VALIDATION_FAILED"
  | "P02_INVARIANT_FAILED";

export class P02RunExecutionError extends Error {
  constructor(
    readonly failureCode: P02FailureCode,
    message: string,
    readonly metadata: P02RunMetadata,
    readonly providerRawResponse: unknown,
    options: { cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "P02RunExecutionError";
  }
}

export type RunP02Options = {
  provider?: P02Provider;
  now?: () => Date;
  inputHash?: string;
};

export async function hashP02Input(input: {
  strategyContext: P01StrategyContext;
  targetConfig: TargetConfigProjection;
  ruleVersions: P02RuleVersions;
}): Promise<string> {
  return sha256(input);
}

function emptyUsage(): AiProviderUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };
}

function addUsage(total: AiProviderUsage, next: AiProviderUsage): void {
  const add = (a: number | null, b: number | null) => a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  total.inputTokens = add(total.inputTokens, next.inputTokens);
  total.outputTokens = add(total.outputTokens, next.outputTokens);
  total.totalTokens = add(total.totalTokens, next.totalTokens);
  total.costUsd = add(total.costUsd, next.costUsd);
}

function correctionFor(title: string, issues: readonly P02ValidationIssue[]): string {
  const issueCodes = new Set(issues.map((issue) => issue.code));
  const targetedRules: string[] = [];
  if (issueCodes.has("unsupported_business_number")) {
    targetedRules.push(
      "Для businessValidation не извлекай числа из narrative/evidence text. Используй только список разрешённых чисел из P02_CANONICAL_INPUT_RULES; если подходящего baseline нет, поставь baseline_value=null.",
    );
  }
  if (issueCodes.has("sanity.TARGET_CONFIG_INCONSISTENCY")) {
    targetedRules.push(
      "Различие modelFamily и visionModelFamily является намеренным поэтапным переходом, уже проверенным backend. Удали ложный TARGET_CONFIG_INCONSISTENCY и собери стратегию по ближайшему modelFamily/targetScores.",
    );
  }
  if (issueCodes.has("target_gap_zero")) {
    targetedRules.push(
      "Выбирай priority/build только среди элементов, у которых targetConfig.gap > 0. Элементы с gap=0 оставь в maintain или later; они не могут входить в elementSequence.",
    );
  }
  return [
    `${title}:`,
    ...issues.slice(0, 24).map((issue) => `- ${issue.path}: ${issue.code}: ${issue.message}`),
    ...targetedRules,
    "Переоцени причинный узел и верни весь JSON заново. Не меняй persisted current/target. При неразрешимом противоречии верни analysisStatus=blocked_by_inconsistency.",
  ].join("\n");
}

function safeValidationSummary(
  prefix: string,
  error: P02SchemaValidationError | P02InvariantError,
): string {
  const issues = error.issues
    .slice(0, 24)
    .map((issue) => `${issue.code}@${issue.path}`)
    .join(", ");
  return issues ? `${prefix}: ${issues}` : prefix;
}

async function defaultProvider(): Promise<P02Provider> {
  const env = process.env;
  return createConfiguredP02Provider(env as unknown as Record<string, string | undefined>);
}

export async function runP02TransitionStrategist(
  input: {
    strategyContext: P01StrategyContext;
    targetConfig: TargetConfigProjection;
    currentScores: SevenKScores;
    ruleVersions: P02RuleVersions;
  },
  options: RunP02Options = {},
): Promise<P02RunOutcome> {
  const now = options.now ?? (() => new Date());
  const started = now();
  const inputHash = options.inputHash ?? await hashP02Input(input);
  let provider: P02Provider;
  try {
    provider = options.provider ?? await defaultProvider();
  } catch (error) {
    const metadata = metadataFor("unconfigured", "unconfigured", inputHash, started, now(), 0, 0, { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null }, input.ruleVersions);
    throw new P02RunExecutionError("P02_PROVIDER_CONFIGURATION_ERROR", error instanceof Error ? error.message : "P-02 provider is not configured", metadata, null, { cause: error });
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
        systemPrompt: buildP02SystemPrompt(input.strategyContext, input.targetConfig, correction),
        outputSchema: P02_OUTPUT_SCHEMA,
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
      throw executionError("P02_TRANSPORT_ERROR", "P-02 provider transport failed", error);
    }

    let parsed: unknown;
    try {
      parsed = parseProviderJson(response.text);
    } catch (error) {
      throw executionError("P02_MALFORMED_JSON", "P-02 returned malformed JSON", error);
    }

    let result;
    try {
      result = normalizeP02CanonicalFields(validateP02Schema(parsed), input);
    } catch (error) {
      throw executionError(
        "P02_SCHEMA_VALIDATION_FAILED",
        error instanceof P02SchemaValidationError
          ? safeValidationSummary("P-02 output schema validation failed", error)
          : "P-02 output schema validation failed",
        error,
      );
    }

    try {
      validateP02Invariants(result, input);
    } catch (error) {
      if (error instanceof P02InvariantError && reevaluationRetryCount === 0) {
        reevaluationRetryCount += 1;
        correction = correctionFor("Нарушены backend semantic invariants", error.issues);
        continue;
      }
      throw executionError(
        "P02_INVARIANT_FAILED",
        error instanceof P02InvariantError
          ? safeValidationSummary("P-02 semantic invariants failed", error)
          : "P-02 semantic invariants failed",
        error,
      );
    }

    const metadata = metadataFor(provider.provider, provider.model, inputHash, started, now(), technicalRetryCount, reevaluationRetryCount, usage, input.ruleVersions);
    if (result.analysisStatus === "blocked_by_inconsistency") {
      return {
        kind: "blocked",
        result,
        failureCode: "P02_BLOCKED_INCONSISTENCY",
        failureMessage: "P-02 found an upstream inconsistency and did not invent a strategy.",
        metadata,
        providerRawResponse: latestRaw,
      };
    }
    return { kind: "success", result, metadata, providerRawResponse: latestRaw };
  }

  function executionError(code: P02FailureCode, message: string, cause: unknown): P02RunExecutionError {
    return new P02RunExecutionError(
      code,
      message,
      metadataFor(provider.provider, provider.model, inputHash, started, now(), technicalRetryCount, reevaluationRetryCount, usage, input.ruleVersions),
      latestRaw,
      { cause },
    );
  }
}

function metadataFor(
  provider: string,
  model: string,
  inputHash: string,
  started: Date,
  finished: Date,
  technicalRetryCount: number,
  reevaluationRetryCount: number,
  usage: AiProviderUsage,
  ruleVersions: P02RuleVersions,
): P02RunMetadata {
  return {
    provider,
    model,
    promptVersion: P02_PROMPT_VERSION,
    outputSchemaVersion: P02_OUTPUT_SCHEMA_VERSION,
    ruleVersions,
    inputHash,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    latencyMs: Math.max(0, finished.getTime() - started.getTime()),
    retryCount: technicalRetryCount + reevaluationRetryCount,
    technicalRetryCount,
    reevaluationRetryCount,
    usage,
  };
}
