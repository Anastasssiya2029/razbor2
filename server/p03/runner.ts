import type { AiProviderUsage } from "@/server/ai/openrouter-json";
import { P03_PROMPT_VERSION } from "@/server/7k/prompts/p03.v1.5";
import { createConfiguredP03Provider } from "./provider";
import type { P03SelectedPreparedInput } from "./projections";
import { buildP03SystemPrompt } from "./request";
import type { P03Provider, P03RunMetadata, P03RunOutcome } from "./types";
import { P03_OUTPUT_SCHEMA_VERSION } from "./types";
import {
  finalizeAndValidateP03Output,
  P03InvariantError,
  P03SchemaValidationError,
  P03_OUTPUT_SCHEMA,
  type P03ValidationIssue,
} from "./validation";

export type P03FailureCode =
  | "P03_PROVIDER_CONFIGURATION_ERROR"
  | "P03_TRANSPORT_ERROR"
  | "P03_MALFORMED_JSON"
  | "P03_SCHEMA_VALIDATION_FAILED"
  | "P03_INVARIANT_FAILED";

export class P03RunExecutionError extends Error {
  constructor(
    readonly failureCode: P03FailureCode,
    message: string,
    readonly metadata: P03RunMetadata,
    readonly providerRawResponse: unknown,
    options: { cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "P03RunExecutionError";
  }
}

export type RunP03Options = {
  provider?: P03Provider;
  now?: () => Date;
};

function emptyUsage(): AiProviderUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 };
}

function addUsage(total: AiProviderUsage, next: AiProviderUsage): void {
  const add = (left: number | null, right: number | null) =>
    left === null && right === null ? null : (left ?? 0) + (right ?? 0);
  total.inputTokens = add(total.inputTokens, next.inputTokens);
  total.outputTokens = add(total.outputTokens, next.outputTokens);
  total.totalTokens = add(total.totalTokens, next.totalTokens);
  total.costUsd = add(total.costUsd, next.costUsd);
}

function correctionFor(title: string, issues: readonly P03ValidationIssue[]): string {
  return [
    `${title}:`,
    ...issues.slice(0, 28).map((issue) => `- ${issue.path}: ${issue.code}: ${issue.message}`),
    "Верни весь JSON заново. Не меняй Stage 7 scenario. Используй только разрешённые scenario→cause→intervention rules. Если точную причину нельзя доказать, верни blocked_by_insufficient_evidence без prescription/test/targetMetric.",
  ].join("\n");
}

async function defaultProvider(): Promise<P03Provider> {
  const { env } = await import("cloudflare:workers");
  return createConfiguredP03Provider(env as unknown as Record<string, string | undefined>);
}

export async function runP03MoneyNowPrescription(
  input: P03SelectedPreparedInput,
  options: RunP03Options = {},
): Promise<P03RunOutcome> {
  const now = options.now ?? (() => new Date());
  const started = now();
  let provider: P03Provider;
  try {
    provider = options.provider ?? await defaultProvider();
  } catch (error) {
    const metadata = metadataFor(
      "unconfigured",
      "unconfigured",
      input,
      started,
      now(),
      0,
      0,
      { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null },
    );
    throw new P03RunExecutionError(
      "P03_PROVIDER_CONFIGURATION_ERROR",
      error instanceof Error ? error.message : "P-03 provider is not configured",
      metadata,
      null,
      { cause: error },
    );
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
        systemPrompt: buildP03SystemPrompt(input, correction),
        outputSchema: P03_OUTPUT_SCHEMA,
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
      throw executionError("P03_TRANSPORT_ERROR", "P-03 provider transport failed", error);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text);
    } catch (error) {
      if (technicalRetryCount === 0) {
        technicalRetryCount += 1;
        correction = "Предыдущий ответ не был JSON. Верни только JSON по schema 1.5.";
        continue;
      }
      throw executionError("P03_MALFORMED_JSON", "P-03 returned malformed JSON", error);
    }

    try {
      const result = finalizeAndValidateP03Output(parsed, input);
      return {
        result,
        metadata: metadataFor(
          provider.provider,
          provider.model,
          input,
          started,
          now(),
          technicalRetryCount,
          reevaluationRetryCount,
          usage,
        ),
        providerRawResponse: latestRaw,
      };
    } catch (error) {
      if (error instanceof P03SchemaValidationError) {
        if (technicalRetryCount === 0) {
          technicalRetryCount += 1;
          correction = correctionFor("Нарушена JSON Schema 1.5", error.issues);
          continue;
        }
        throw executionError("P03_SCHEMA_VALIDATION_FAILED", "P-03 output schema validation failed", error);
      }
      if (error instanceof P03InvariantError) {
        if (reevaluationRetryCount === 0) {
          reevaluationRetryCount += 1;
          correction = correctionFor("Нарушены backend semantic invariants", error.issues);
          continue;
        }
        throw executionError("P03_INVARIANT_FAILED", "P-03 semantic invariants failed", error);
      }
      throw error;
    }
  }

  function executionError(
    code: P03FailureCode,
    message: string,
    cause: unknown,
  ): P03RunExecutionError {
    return new P03RunExecutionError(
      code,
      message,
      metadataFor(
        provider.provider,
        provider.model,
        input,
        started,
        now(),
        technicalRetryCount,
        reevaluationRetryCount,
        usage,
      ),
      latestRaw,
      { cause },
    );
  }
}

function metadataFor(
  provider: string,
  model: string,
  input: P03SelectedPreparedInput,
  started: Date,
  finished: Date,
  technicalRetryCount: number,
  reevaluationRetryCount: number,
  usage: AiProviderUsage,
): P03RunMetadata {
  return {
    provider,
    model,
    promptVersion: P03_PROMPT_VERSION,
    outputSchemaVersion: P03_OUTPUT_SCHEMA_VERSION,
    ruleVersions: input.ruleVersions,
    inputHash: input.inputHash,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    latencyMs: Math.max(0, finished.getTime() - started.getTime()),
    retryCount: technicalRetryCount + reevaluationRetryCount,
    technicalRetryCount,
    reevaluationRetryCount,
    usage,
  };
}
