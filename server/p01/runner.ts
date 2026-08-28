import { assertDiagnosticInputForAi, type DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import { EVIDENCE_ROUTING_RESOURCE_VERSION } from "@/server/7k/config/evidence-routing.v3.0";
import { MONEY_NOW_HISTORY_MAP_RESOURCE_VERSION } from "@/server/7k/config/money-now-history-map.v2.2";
import { MONEY_NOW_FACT_EXTRACTION_VERSION } from "@/server/7k/config/money-now-fact-extraction.v1";
import { SCORING_RULES_RESOURCE_VERSION } from "@/server/7k/config/scoring-rules.v3.0";
import { TARGET_MODEL_DICTIONARY_RESOURCE_VERSION } from "@/server/7k/config/target-model-dictionary.v2.2";
import { P01_PROMPT_VERSION } from "@/server/7k/prompts/p01.v1.4";
import { SEVEN_K_ELEMENT_IDS, type SevenKElementId } from "@/server/7k/types";
import { openRouterErrorArtifact } from "@/server/ai/openrouter-json";
import { parseProviderJson } from "@/server/ai/provider-json";
import { createConfiguredP01Provider } from "./provider";
import { buildP01SystemPrompt } from "./request";
import {
  buildP01CoreContextPrompt,
  buildP01ElementScorePrompt,
  P01_CORE_CONTEXT_OUTPUT_SCHEMA,
  p01ElementScoreOutputSchema,
  validateP01CoreContext,
  validateP01ElementScoreEnvelope,
  reconcileP01CoreEvidenceReferences,
  type P01CoreContext,
  type P01ElementScoreEnvelope,
} from "./split-request";
import {
  hydrateDisabledMoneyNow,
  P01_WITHOUT_MONEY_NOW_OUTPUT_SCHEMA,
} from "./money-now-disabled";
import type {
  P01Provider,
  P01ResultV1_4_2,
  P01ProviderUsage,
  P01RunMetadata,
  P01RunOutcome,
  RunP01Options,
} from "./types";
import { P01_OUTPUT_SCHEMA_VERSION } from "./types";
import {
  P01InvariantError,
  P01SchemaValidationError,
  normalizeP01CanonicalFields,
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
  readonly failureDetails: P01ValidationIssue[];

  constructor(options: {
    failureCode: P01FailureCode;
    message: string;
    metadata: P01RunMetadata;
    providerRawResponse: unknown;
    failureDetails?: readonly P01ValidationIssue[];
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "P01RunExecutionError";
    this.failureCode = options.failureCode;
    this.metadata = options.metadata;
    this.providerRawResponse = options.providerRawResponse;
    this.failureDetails = structuredClone(options.failureDetails ?? []);
  }
}

const P01_RULE_VERSIONS = {
  requestBuilder: "p01-request-builder.v2.3",
  scoringRules: SCORING_RULES_RESOURCE_VERSION,
  evidenceRouting: EVIDENCE_ROUTING_RESOURCE_VERSION,
  targetModelDictionary: TARGET_MODEL_DICTIONARY_RESOURCE_VERSION,
  moneyNowHistoryMap: MONEY_NOW_HISTORY_MAP_RESOURCE_VERSION,
  moneyNowFactExtraction: MONEY_NOW_FACT_EXTRACTION_VERSION,
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

function issuesCorrection(
  kind: string,
  issues: readonly P01ValidationIssue[],
  validEvidenceIds: readonly string[] = [],
): string {
  const targeted: string[] = [];
  if (
    issues.some((issue) =>
      [
        "money_now_false_without_evidence",
        "money_now_false_without_negative_evidence",
      ].includes(issue.code),
    )
  ) {
    targeted.push(
      "Для каждого confirmed_false используй evidence с valence=negative и допустимым по evidencePolicy time_scope. Если отсутствие подтверждается числом 0, создай отдельный metric_result evidence item с valence=negative. Если такого evidence нет — поставь unknown.",
    );
  }
  if (issues.some((issue) => issue.code === "money_now_fact_without_policy_evidence")) {
    targeted.push(
      "Исправь time_scope по evidencePolicy: current_required допускает только current; current_or_historical_repeatable — current/historical_repeatable; historical_allowed — current/historical_repeatable/historical_only; hypothesis не подтверждает true/false.",
    );
  }
  if (issues.some((issue) => issue.code === "new_condition_code_evidence_mismatch")) {
    targeted.push(
      "Свяжи condition_code с тем же current evidence ID у соответствующего confirmed_true moneyNowFact; не подменяй PRODUCT evidence фактом CAPACITY и наоборот.",
    );
  }
  if (issues.some((issue) => issue.code === "dangling_evidence_id")) {
    targeted.push(
      `Допустимые ID из текущего evidenceLedger: ${JSON.stringify(validEvidenceIds)}. Каждая ссылка во всех evidence_ids/counterevidence_ids/new_condition_evidence_ids должна byte-equal совпадать с evidenceLedger.id. Если нужного доказательства нет, добавь одну корректную запись ledger и используй её exact ID либо убери недоказанное утверждение. Перед ответом проверь, что set(all referenced IDs) \\ set(evidenceLedger.id) пуст.`,
    );
  }
  return [
    `${kind}:`,
    ...issues.slice(0, 20).map((issue) => `- ${issue.path}: ${issue.code}: ${issue.message}`),
    ...targeted.map((message) => `- TARGETED_FIX: ${message}`),
    "Верни весь JSON заново строго по исходной schema v1.4; не меняй факты без необходимости исправить указанное противоречие.",
  ].join("\n");
}

async function defaultProvider(): Promise<P01Provider> {
  const { env } = await import("cloudflare:workers");
  return createConfiguredP01Provider(env as unknown as Record<string, string | undefined>);
}

function safeValidationSummary(
  prefix: string,
  error: P01SchemaValidationError | P01InvariantError,
): string {
  const issues = error.issues
    .slice(0, 20)
    .map((issue) => `${issue.code}@${issue.path}`)
    .join(", ");
  return issues ? `${prefix}: ${issues}` : prefix;
}

export async function runP01EvidenceScorer(
  input: DiagnosticInputV1_2,
  options: RunP01Options = {},
): Promise<P01RunOutcome> {
  const normalizedInput = assertDiagnosticInputForAi(input);
  const moneyNowEnabled = options.moneyNowEnabled ?? true;
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

  if (!moneyNowEnabled) return runSplitCore();

  while (true) {
    let response;
    try {
      response = await provider.complete({
        systemPrompt: buildP01SystemPrompt(normalizedInput, correction, { moneyNowEnabled }),
        outputSchema: moneyNowEnabled
          ? P01_OUTPUT_SCHEMA
          : P01_WITHOUT_MONEY_NOW_OUTPUT_SCHEMA,
        correction,
      });
      latestRaw = response.rawResponse;
      addUsage(usage, response.usage);
    } catch (error) {
      latestRaw = openRouterErrorArtifact(error);
      if (technicalRetryCount === 0) {
        technicalRetryCount += 1;
        correction = null;
        continue;
      }
      throw executionError("P01_TRANSPORT_ERROR", error, "P-01 provider transport failed", latestRaw);
    }

    let parsed: unknown;
    try {
      parsed = parseProviderJson(response.text);
    } catch (error) {
      if (technicalRetryCount === 0) {
        technicalRetryCount += 1;
        correction = "Предыдущий ответ не был валидным JSON. Верни только JSON по schema v1.4 без Markdown и code fences.";
        continue;
      }
      throw executionError("P01_MALFORMED_JSON", error, "P-01 returned malformed JSON", latestRaw);
    }

    let result;
    try {
      result = normalizeP01CanonicalFields(
        validateP01Schema(moneyNowEnabled ? parsed : hydrateDisabledMoneyNow(parsed)),
        normalizedInput,
      );
    } catch (error) {
      if (error instanceof P01SchemaValidationError && technicalRetryCount === 0) {
        technicalRetryCount += 1;
        correction = issuesCorrection("Нарушена JSON Schema", error.issues);
        continue;
      }
      throw executionError(
        "P01_SCHEMA_VALIDATION_FAILED",
        error,
        error instanceof P01SchemaValidationError
          ? safeValidationSummary("P-01 output schema validation failed", error)
          : "P-01 output schema validation failed",
        latestRaw,
      );
    }

    try {
      validateP01Invariants(result);
    } catch (error) {
      if (error instanceof P01InvariantError && reevaluationRetryCount === 0) {
        reevaluationRetryCount += 1;
        correction = issuesCorrection(
          "Нарушены backend invariants",
          error.issues,
          result.evidenceLedger.map((evidence) => evidence.id),
        );
        continue;
      }
      throw executionError(
        "P01_INVARIANT_FAILED",
        error,
        error instanceof P01InvariantError
          ? safeValidationSummary("P-01 semantic invariants failed", error)
          : "P-01 semantic invariants failed",
        latestRaw,
      );
    }

    const sanityErrors = p01SanityErrors(result);
    if (sanityErrors.length > 0) {
      if (reevaluationRetryCount === 0) {
        reevaluationRetryCount += 1;
        correction = issuesCorrection("Sanity check severity=error", sanityErrors);
        continue;
      }
      throw executionError(
        "P01_SANITY_ERROR",
        new Error(sanityErrors.map((issue) => issue.message).join("; ")),
        "P-01 sanity checks failed",
        latestRaw,
        sanityErrors,
      );
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
    failureDetails: readonly P01ValidationIssue[] =
      cause instanceof P01SchemaValidationError || cause instanceof P01InvariantError
        ? cause.issues
        : [],
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
      failureDetails,
      cause,
    });
  }

  async function runSplitCore(): Promise<P01RunOutcome> {
    const rawParts: Record<string, unknown> = {};
    latestRaw = rawParts;

    async function completePart<T>(part: {
      key: string;
      schemaName: string;
      outputSchema: Record<string, unknown>;
      buildPrompt: (correction: string | null) => string;
      validate: (value: unknown) => T;
      initialCorrection?: string | null;
    }): Promise<T> {
      let partCorrection = part.initialCorrection ?? null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        let response;
        try {
          response = await provider.complete({
            systemPrompt: part.buildPrompt(partCorrection),
            outputSchema: part.outputSchema,
            correction: partCorrection,
            schemaName: part.schemaName,
          });
          rawParts[part.key] = response.rawResponse;
          addUsage(usage, response.usage);
        } catch (error) {
          rawParts[part.key] = openRouterErrorArtifact(error);
          if (attempt === 0) {
            technicalRetryCount += 1;
            partCorrection = null;
            continue;
          }
          throw executionError(
            "P01_TRANSPORT_ERROR",
            error,
            `P-01 provider transport failed in ${part.key}`,
            rawParts,
          );
        }

        let parsed: unknown;
        try {
          parsed = parseProviderJson(response.text);
        } catch (error) {
          if (attempt === 0) {
            technicalRetryCount += 1;
            partCorrection = "Предыдущий ответ не был валидным JSON. Верни только JSON по переданной provider schema без Markdown и code fences.";
            continue;
          }
          throw executionError(
            "P01_MALFORMED_JSON",
            error,
            `P-01 returned malformed JSON in ${part.key}`,
            rawParts,
          );
        }

        try {
          return part.validate(parsed);
        } catch (error) {
          if (error instanceof P01SchemaValidationError && attempt === 0) {
            technicalRetryCount += 1;
            partCorrection = issuesCorrection("Нарушена JSON Schema этого блока", error.issues);
            continue;
          }
          throw executionError(
            "P01_SCHEMA_VALIDATION_FAILED",
            error,
            error instanceof P01SchemaValidationError
              ? safeValidationSummary(`P-01 schema validation failed in ${part.key}`, error)
              : `P-01 schema validation failed in ${part.key}`,
            rawParts,
          );
        }
      }
      throw executionError(
        "P01_SCHEMA_VALIDATION_FAILED",
        new Error(`P-01 exhausted ${part.key}`),
        `P-01 exhausted ${part.key}`,
        rawParts,
      );
    }

    async function scoreElement(
      context: P01CoreContext,
      elementId: SevenKElementId,
      scoreCorrection: string | null = null,
    ): Promise<P01ElementScoreEnvelope> {
      const suffix = scoreCorrection ? "reevaluation" : "initial";
      return completePart({
        key: `score.${elementId}.${suffix}`,
        schemaName: `p01_score_${elementId}_v1_4`,
        outputSchema: p01ElementScoreOutputSchema(elementId),
        buildPrompt: (correction) => buildP01ElementScorePrompt({
          input: normalizedInput,
          context,
          elementId,
          correction,
        }),
        validate: (value) => validateP01ElementScoreEnvelope(elementId, value),
        initialCorrection: scoreCorrection,
      });
    }

    async function awaitAll<T>(promises: Promise<T>[]): Promise<T[]> {
      const settled = await Promise.allSettled(promises);
      const failure = settled.find(
        (item): item is PromiseRejectedResult => item.status === "rejected",
      );
      if (failure) throw failure.reason;
      return settled.map((item) => (item as PromiseFulfilledResult<T>).value);
    }

    const loadContext = (contextCorrection: string | null = null) => completePart({
      key: contextCorrection ? "context.reevaluation" : "context.initial",
      schemaName: "p01_core_context_v1_4",
      outputSchema: P01_CORE_CONTEXT_OUTPUT_SCHEMA,
      buildPrompt: (correction) => buildP01CoreContextPrompt(normalizedInput, correction),
      validate: validateP01CoreContext,
      initialCorrection: contextCorrection,
    });
    const hydrateCoreForValidation = (value: P01CoreContext): P01ResultV1_4_2 => {
      const emptyScorecard = {
        score: null,
        confidence: "low" as const,
        evidence_cap: null,
        cap_reason: null,
        matched_level_rule_id: null,
        next_level_rule_id: null,
        evidence_ids: [],
        counterevidence_ids: [],
        why_not_higher: null,
        contradiction: null,
        historical_asset: null,
        missing_evidence: [],
      };
      return hydrateDisabledMoneyNow({
        ...structuredClone(value),
        analysisStatus: "blocked_by_insufficient_data",
        current7k: Object.fromEntries(
          SEVEN_K_ELEMENT_IDS.map((elementId) => [elementId, structuredClone(emptyScorecard)]),
        ),
      });
    };
    const validateCoreSemantics = (value: P01CoreContext): void => {
      const probe = validateP01Schema(hydrateCoreForValidation(value));
      validateP01Invariants(probe);
    };

    let context = reconcileP01CoreEvidenceReferences(await loadContext());
    try {
      validateCoreSemantics(context);
    } catch (error) {
      if (!(error instanceof P01InvariantError)) {
        throw executionError(
          "P01_INVARIANT_FAILED",
          error,
          "P-01 core context invariant validation failed",
          rawParts,
        );
      }
      reevaluationRetryCount += 1;
      const previousContext = context;
      context = reconcileP01CoreEvidenceReferences(await loadContext(issuesCorrection(
        "Нарушены backend invariants блока общего контекста",
        error.issues,
        context.evidenceLedger.map((evidence) => evidence.id),
      )), previousContext);
      try {
        validateCoreSemantics(context);
      } catch (retryError) {
        throw executionError(
          "P01_INVARIANT_FAILED",
          retryError,
          retryError instanceof P01InvariantError
            ? safeValidationSummary("P-01 core context invariants failed after retry", retryError)
            : "P-01 core context invariants failed after retry",
          rawParts,
        );
      }
    }

    let coreSanityErrors = p01SanityErrors(hydrateCoreForValidation(context));
    if (coreSanityErrors.length > 0) {
      reevaluationRetryCount += 1;
      const previousContext = context;
      context = reconcileP01CoreEvidenceReferences(await loadContext(issuesCorrection(
        "Общий контекст содержит sanity severity=error",
        coreSanityErrors,
        context.evidenceLedger.map((evidence) => evidence.id),
      )), previousContext);
      try {
        validateCoreSemantics(context);
      } catch (error) {
        throw executionError(
          "P01_INVARIANT_FAILED",
          error,
          error instanceof P01InvariantError
            ? safeValidationSummary("P-01 corrected core invariants failed", error)
            : "P-01 corrected core invariant validation failed",
          rawParts,
        );
      }
      coreSanityErrors = p01SanityErrors(hydrateCoreForValidation(context));
      if (coreSanityErrors.length > 0) {
        throw executionError(
          "P01_SANITY_ERROR",
          new Error(coreSanityErrors.map((issue) => issue.message).join("; ")),
          "P-01 core sanity checks failed after targeted retry",
          rawParts,
          coreSanityErrors,
        );
      }
    }
    let scoreEnvelopes = await awaitAll(
      SEVEN_K_ELEMENT_IDS.map((elementId) => scoreElement(context, elementId)),
    );

    const mergeResult = (): P01ResultV1_4_2 => {
      const current7k = Object.fromEntries(
        scoreEnvelopes.map(({ elementId, scorecard }) => [elementId, scorecard]),
      ) as P01ResultV1_4_2["current7k"];
      const combined = hydrateDisabledMoneyNow({ ...context, current7k });
      return normalizeP01CanonicalFields(validateP01Schema(combined), normalizedInput);
    };

    let result = mergeResult();
    try {
      validateP01Invariants(result);
    } catch (error) {
      if (!(error instanceof P01InvariantError)) {
        throw executionError(
          "P01_INVARIANT_FAILED",
          error,
          "P-01 semantic invariants failed",
          rawParts,
        );
      }
      const issuesByElement = new Map<SevenKElementId, P01ValidationIssue[]>();
      for (const issue of error.issues) {
        const match = issue.path.match(/^\/current7k\/([^/]+)/u);
        const elementId = match?.[1] as SevenKElementId | undefined;
        if (!elementId || !(SEVEN_K_ELEMENT_IDS as readonly string[]).includes(elementId)) {
          throw executionError(
            "P01_INVARIANT_FAILED",
            error,
            safeValidationSummary("P-01 non-score invariant failed", error),
            rawParts,
          );
        }
        const group = issuesByElement.get(elementId) ?? [];
        group.push(issue);
        issuesByElement.set(elementId, group);
      }

      const replacements = await awaitAll(
        Array.from(issuesByElement, ([elementId, issues]) => {
          reevaluationRetryCount += 1;
          return scoreElement(
            context,
            elementId,
            issuesCorrection(
              "Нарушены backend invariants только этого элемента",
              issues,
              context.evidenceLedger.map((evidence) => evidence.id),
            ),
          );
        }),
      );
      const byElement = new Map(scoreEnvelopes.map((item) => [item.elementId, item]));
      replacements.forEach((item) => byElement.set(item.elementId, item));
      scoreEnvelopes = SEVEN_K_ELEMENT_IDS.map((elementId) => byElement.get(elementId)!);
      result = mergeResult();
      try {
        validateP01Invariants(result);
      } catch (retryError) {
        throw executionError(
          "P01_INVARIANT_FAILED",
          retryError,
          retryError instanceof P01InvariantError
            ? safeValidationSummary("P-01 semantic invariants failed after targeted retry", retryError)
            : "P-01 semantic invariants failed after targeted retry",
          rawParts,
        );
      }
    }

    const sanityErrors = p01SanityErrors(result);
    if (sanityErrors.length > 0) {
      throw executionError(
        "P01_SANITY_ERROR",
        new Error(sanityErrors.map((issue) => issue.message).join("; ")),
        "P-01 sanity checks failed; the core context is not regenerated automatically",
        rawParts,
        sanityErrors,
      );
    }

    const metadata = createMetadata({
      provider: provider.provider,
      model: provider.model,
      inputHash,
      startedAtDate,
      finishedAt: now(),
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
        providerRawResponse: rawParts,
      };
    }
    if (result.analysisStatus === "blocked_by_inconsistency") {
      return {
        kind: "blocked",
        result,
        failureCode: "P01_BLOCKED_INCONSISTENCY",
        failureMessage: "P-01 заблокирован из-за неразрешённого противоречия во входных данных.",
        metadata,
        providerRawResponse: rawParts,
      };
    }
    return { kind: "success", result, metadata, providerRawResponse: rawParts };
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
