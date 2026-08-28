import type { AiProviderUsage } from "@/server/ai/openrouter-json";
import { parseProviderJson } from "@/server/ai/provider-json";
import { P04_PROMPT_VERSION } from "@/server/7k/prompts/p04.v1.2";
import { createConfiguredP04Provider } from "./provider";
import { buildP04SystemPrompt } from "./request";
import {
  hydrateDisabledP04MoneyNow,
  P04_WITHOUT_MONEY_NOW_OUTPUT_SCHEMA,
} from "./money-now-disabled";
import type { P04PreparedInput } from "./stage-types";
import type {
  P04AttemptDiagnostic,
  P04Provider,
  P04RunMetadata,
  P04RunOutcome,
} from "./types";
import { P04_OUTPUT_SCHEMA_VERSION } from "./types";
import {
  canonicalizeP04ImmutableEchoes,
  canonicalizeP04NarrativePresentation,
  finalizeAndValidateP04Output,
  P04InvariantError,
  P04SchemaValidationError,
  P04_OUTPUT_SCHEMA,
  type P04ValidationIssue,
} from "./validation";

export type P04FailureCode =
  | "P04_PROVIDER_CONFIGURATION_ERROR"
  | "P04_TRANSPORT_ERROR"
  | "P04_MALFORMED_JSON"
  | "P04_SCHEMA_VALIDATION_FAILED"
  | "P04_INVARIANT_FAILED";

export class P04RunExecutionError extends Error {
  constructor(
    readonly failureCode: P04FailureCode,
    message: string,
    readonly metadata: P04RunMetadata,
    readonly providerRawResponse: unknown,
    options: { cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "P04RunExecutionError";
  }
}

export type RunP04Options = {
  provider?: P04Provider;
  now?: () => Date;
  moneyNowEnabled?: boolean;
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

function correctionFor(title: string, issues: readonly P04ValidationIssue[]): string {
  return [
    `${title}:`,
    ...issues.slice(0, 32).map((issue) => `- ${issue.path}: ${issue.code}: ${issue.message}`),
    "Верни весь JSON заново по schema 1.2. Не меняй upstream decisions, task IDs, route identities, businessValidation, Money Now status или locked teaser. Не добавляй новые действия. Используй только SOURCE_REGISTRY. Клиентские тексты перепиши коротко и разговорно, как понятное объяснение другу.",
  ].join("\n");
}

function attemptDiagnostic(
  attempt: number,
  kind: P04AttemptDiagnostic["kind"],
  issues: readonly Pick<P04ValidationIssue, "path" | "code">[],
): P04AttemptDiagnostic {
  return {
    attempt,
    kind,
    issues: issues.slice(0, 32).map(({ path, code }) => ({ path, code })),
  };
}

async function defaultProvider(): Promise<P04Provider> {
  const { env } = await import("cloudflare:workers");
  return createConfiguredP04Provider(env as unknown as Record<string, string | undefined>);
}

export async function runP04ReportWriter(
  input: P04PreparedInput,
  options: RunP04Options = {},
): Promise<P04RunOutcome> {
  const now = options.now ?? (() => new Date());
  const moneyNowEnabled = options.moneyNowEnabled ?? true;
  const started = now();
  let provider: P04Provider;
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
      [],
      { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null },
    );
    throw new P04RunExecutionError(
      "P04_PROVIDER_CONFIGURATION_ERROR",
      error instanceof Error ? error.message : "P-04 provider is not configured",
      metadata,
      null,
      { cause: error },
    );
  }

  let technicalRetryCount = 0;
  let reevaluationRetryCount = 0;
  let correction: string | null = null;
  let latestRaw: unknown = null;
  let providerAttempt = 0;
  const attemptDiagnostics: P04AttemptDiagnostic[] = [];
  const usage = emptyUsage();

  while (true) {
    let response;
    try {
      providerAttempt += 1;
      response = await provider.complete({
        systemPrompt: buildP04SystemPrompt(input, correction, { moneyNowEnabled }),
        outputSchema: moneyNowEnabled
          ? P04_OUTPUT_SCHEMA
          : P04_WITHOUT_MONEY_NOW_OUTPUT_SCHEMA,
        correction,
      });
      latestRaw = response.rawResponse;
      addUsage(usage, response.usage);
    } catch (error) {
      attemptDiagnostics.push(attemptDiagnostic(providerAttempt, "transport", [
        { path: "/provider", code: "transport_error" },
      ]));
      if (technicalRetryCount === 0) {
        technicalRetryCount += 1;
        correction = null;
        continue;
      }
      throw executionError("P04_TRANSPORT_ERROR", "P-04 provider transport failed", error);
    }

    let parsed: unknown;
    try {
      parsed = parseProviderJson(response.text);
    } catch (error) {
      attemptDiagnostics.push(attemptDiagnostic(providerAttempt, "malformed_json", [
        { path: "/", code: "malformed_json" },
      ]));
      if (technicalRetryCount === 0) {
        technicalRetryCount += 1;
        correction = "Предыдущий ответ не был JSON. Верни только JSON по schema 1.2.";
        continue;
      }
      throw executionError("P04_MALFORMED_JSON", "P-04 returned malformed JSON", error);
    }

    try {
      const canonical = canonicalizeP04ImmutableEchoes(
        moneyNowEnabled ? parsed : hydrateDisabledP04MoneyNow(parsed, input),
        input,
      );
      return {
        result: finalizeAndValidateP04Output(
          reevaluationRetryCount > 0
            ? canonicalizeP04NarrativePresentation(canonical)
            : canonical,
          input,
        ),
        metadata: metadataFor(
          provider.provider,
          provider.model,
          input,
          started,
          now(),
          technicalRetryCount,
          reevaluationRetryCount,
          attemptDiagnostics,
          usage,
        ),
        providerRawResponse: latestRaw,
      };
    } catch (error) {
      if (error instanceof P04SchemaValidationError) {
        attemptDiagnostics.push(attemptDiagnostic(providerAttempt, "schema", error.issues));
        if (technicalRetryCount === 0) {
          technicalRetryCount += 1;
          correction = correctionFor("Нарушена JSON Schema 1.2", error.issues);
          continue;
        }
        const safeIssues = error.issues
          .slice(0, 20)
          .map((issue) => `${issue.code}@${issue.path}`)
          .join(", ");
        throw executionError(
          "P04_SCHEMA_VALIDATION_FAILED",
          `P-04 output schema validation failed${safeIssues ? `: ${safeIssues}` : ""}`,
          error,
        );
      }
      if (error instanceof P04InvariantError) {
        attemptDiagnostics.push(attemptDiagnostic(providerAttempt, "semantic", error.issues));
        if (reevaluationRetryCount === 0) {
          reevaluationRetryCount += 1;
          correction = correctionFor("Нарушены backend semantic invariants", error.issues);
          continue;
        }
        const safeIssues = error.issues
          .slice(0, 20)
          .map((issue) => `${issue.code}@${issue.path}`)
          .join(", ");
        throw executionError(
          "P04_INVARIANT_FAILED",
          `P-04 semantic invariants failed${safeIssues ? `: ${safeIssues}` : ""}`,
          error,
        );
      }
      throw error;
    }
  }

  function executionError(
    code: P04FailureCode,
    message: string,
    cause: unknown,
  ): P04RunExecutionError {
    return new P04RunExecutionError(
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
        attemptDiagnostics,
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
  input: P04PreparedInput,
  started: Date,
  finished: Date,
  technicalRetryCount: number,
  reevaluationRetryCount: number,
  attemptDiagnostics: P04AttemptDiagnostic[],
  usage: AiProviderUsage,
): P04RunMetadata {
  return {
    provider,
    model,
    promptVersion: P04_PROMPT_VERSION,
    outputSchemaVersion: P04_OUTPUT_SCHEMA_VERSION,
    ruleVersions: input.ruleVersions,
    inputHash: input.inputHash,
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    latencyMs: Math.max(0, finished.getTime() - started.getTime()),
    retryCount: technicalRetryCount + reevaluationRetryCount,
    technicalRetryCount,
    reevaluationRetryCount,
    attemptDiagnostics: structuredClone(attemptDiagnostics),
    usage,
  };
}
