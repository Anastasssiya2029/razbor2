import { aiCallLogTable, db } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { openRouterErrorArtifact } from "./openrouter-json";

export type AiCallLogModule = "p01" | "p02" | "p03" | "p04" | "situation_summary";

export type AiCallLogContext = {
  module: AiCallLogModule;
  // Null for calls made before a diagnostic/analysis run exists yet (only
  // situation-summary, today) -- such rows carry situationSessionId instead
  // and get backfilled with a real analysisRunId if the diagnostic is later
  // submitted. Every other module always has a real run id.
  analysisRunId: string | null;
  situationSessionId?: string;
};

type GenericUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
};

type GenericProviderResponse = {
  text: string;
  rawResponse: unknown;
  usage: GenericUsage;
};

type GenericProviderRequest = {
  systemPrompt: string;
  outputSchema: Record<string, unknown>;
  correction: string | null;
  schemaName?: string;
};

export type GenericProvider = {
  readonly provider: string;
  readonly model: string;
  complete(request: GenericProviderRequest): Promise<GenericProviderResponse>;
};

// Providers are free-text from OpenRouter error bodies / SDK errors and may
// echo request headers or long fragments of the (private) system prompt back
// in edge cases. Never persist that verbatim -- keep only a short, redacted
// summary, matching the brief's "no PII/prompts/keys in error details"
// requirement.
const SECRET_LIKE_PATTERN = /(bearer\s+\S+|sk-[a-z0-9_-]{8,}|api[_-]?key\S*)/gi;
const MAX_ERROR_MESSAGE_LENGTH = 300;

export function sanitizeErrorMessage(raw: string): string {
  const redacted = raw.replace(SECRET_LIKE_PATTERN, "[REDACTED]");
  const singleLine = redacted.replace(/\s+/g, " ").trim();
  return singleLine.length > MAX_ERROR_MESSAGE_LENGTH
    ? `${singleLine.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…`
    : singleLine;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function recordAiCallLog(entry: {
  analysisRunId: string | null;
  situationSessionId?: string;
  module: AiCallLogModule;
  attemptIndex: number;
  provider: string;
  model: string;
  status: "success" | "error";
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  usage: GenericUsage;
  latencyMs: number;
  startedAt: Date;
  completedAt: Date;
}): Promise<void> {
  try {
    await db.insert(aiCallLogTable).values({
      analysisRunId: entry.analysisRunId,
      situationSessionId: entry.situationSessionId ?? null,
      module: entry.module,
      attemptIndex: entry.attemptIndex,
      provider: entry.provider,
      model: entry.model,
      status: entry.status,
      httpStatus: entry.httpStatus,
      errorCode: entry.errorCode,
      errorMessage: entry.errorMessage,
      inputTokens: entry.usage.inputTokens,
      outputTokens: entry.usage.outputTokens,
      totalTokens: entry.usage.totalTokens,
      costUsd: entry.usage.costUsd,
      latencyMs: entry.latencyMs,
      startedAt: entry.startedAt,
      completedAt: entry.completedAt,
    });
  } catch (logError) {
    // A logging failure must never fail (or silently corrupt) the actual
    // analysis pipeline -- the call itself already succeeded or failed on
    // its own terms above.
    console.error("[ai-call-log] failed to record call", logError);
  }
}

/**
 * Attaches any situation-summary ai_call_log rows recorded under a
 * pre-submission form sessionId to the real analysisRunId once the
 * diagnostic is actually created/submitted, so their cost is included in
 * that run's total instead of staying permanently unlinked. Safe to call
 * with no matching rows (client never asked for a situation summary) or
 * when reusing an existing run (idempotent replay) -- it only ever touches
 * rows that are still unlinked.
 */
export async function reconcileSituationSummaryCallLogs(sessionId: string, analysisRunId: string): Promise<void> {
  try {
    await db
      .update(aiCallLogTable)
      .set({ analysisRunId, situationSessionId: null })
      .where(and(eq(aiCallLogTable.situationSessionId, sessionId), isNull(aiCallLogTable.analysisRunId)));
  } catch (error) {
    // Same principle as recordAiCallLog: a reconciliation failure must never
    // fail the actual diagnostic submission that already succeeded.
    console.error("[ai-call-log] failed to reconcile situation-summary call logs", error);
  }
}

/**
 * Wraps a P0X provider so every real outbound request it makes (success or
 * failure, including every retry) is recorded as one row in ai_call_log.
 * This is the single instrumentation point for the whole pipeline: whatever
 * retry logic a runner uses, it always goes through this one `.complete()`.
 */
export function withCallLogging<TProvider extends GenericProvider>(
  provider: TProvider,
  context: AiCallLogContext,
): TProvider {
  let attemptIndex = 0;
  return {
    ...provider,
    provider: provider.provider,
    model: provider.model,
    async complete(request: GenericProviderRequest) {
      attemptIndex += 1;
      const thisAttempt = attemptIndex;
      const startedAt = new Date();
      const t0 = Date.now();
      try {
        const response = await provider.complete(request);
        const completedAt = new Date();
        // Awaited (not fire-and-forget): for situation-summary this row must
        // be committed before the HTTP response reaches the client, or the
        // client can submit the diagnostic (triggering reconciliation)
        // before the row exists to reconcile, leaving it permanently
        // unlinked. recordAiCallLog still swallows its own errors, so this
        // can never turn a logging failure into a failed AI call.
        await recordAiCallLog({
          analysisRunId: context.analysisRunId,
          situationSessionId: context.situationSessionId,
          module: context.module,
          attemptIndex: thisAttempt,
          provider: provider.provider,
          model: provider.model,
          status: "success",
          httpStatus: 200,
          errorCode: null,
          errorMessage: null,
          usage: response.usage,
          latencyMs: Date.now() - t0,
          startedAt,
          completedAt,
        });
        return response;
      } catch (error) {
        const completedAt = new Date();
        const artifact = openRouterErrorArtifact(error);
        const errorCode = artifact?.error.code ?? (isAbortError(error) ? "REQUEST_TIMEOUT" : "UNKNOWN_ERROR");
        const errorMessage = sanitizeErrorMessage(
          artifact?.error.message ?? (error instanceof Error ? error.message : "Unknown provider error"),
        );
        // Same reasoning as the success branch above: must be committed
        // before the response returns.
        await recordAiCallLog({
          analysisRunId: context.analysisRunId,
          situationSessionId: context.situationSessionId,
          module: context.module,
          attemptIndex: thisAttempt,
          provider: provider.provider,
          model: provider.model,
          status: "error",
          httpStatus: artifact?.httpStatus ?? null,
          errorCode,
          errorMessage,
          usage: { inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null },
          latencyMs: Date.now() - t0,
          startedAt,
          completedAt,
        });
        throw error;
      }
    },
  } as TProvider;
}
