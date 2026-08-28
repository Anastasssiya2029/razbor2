import { getDb } from "@/db";
import { analysisRuns, p01AnalysisResults } from "@/db/schema";
import { assertDiagnosticInputForAi, type DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import { and, eq, sql } from "drizzle-orm";
import type { P01Provider, P01RunMetadata, P01RunOutcome } from "./types";
import { P01RunExecutionError, runP01EvidenceScorer } from "./runner";

export type ExecuteP01AnalysisRunInput = {
  analysisRunId: string;
  diagnosticId: string;
  input: DiagnosticInputV1_2;
  provider?: P01Provider;
  moneyNowEnabled?: boolean;
};

export type ExecuteP01AnalysisRunResult = {
  status: "targeting" | "analysis_failed";
  outcome: P01RunOutcome | null;
  failureCode: string | null;
  failureMessage: string | null;
  failureDetails: Array<{ path: string; code: string; message: string }>;
};

function safeJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ serializationError: "provider_raw_response_not_serializable" });
  }
}

async function persistP01Record(options: {
  analysisRunId: string;
  diagnosticId: string;
  metadata: P01RunMetadata;
  result: unknown | null;
  providerRawResponse: unknown;
  failureCode: string | null;
  failureMessage: string | null;
  failureDetails?: ReadonlyArray<{ path: string; code: string; message: string }>;
}): Promise<void> {
  const db = await getDb();
  const values = {
    id: crypto.randomUUID(),
    diagnosticId: options.diagnosticId,
    analysisRunId: options.analysisRunId,
    promptVersion: options.metadata.promptVersion,
    outputSchemaVersion: options.metadata.outputSchemaVersion,
    ruleVersionsJson: JSON.stringify(options.metadata.ruleVersions),
    inputHash: options.metadata.inputHash,
    resultJson: safeJson(options.result),
    providerRawResponseJson: safeJson(options.providerRawResponse),
    provider: options.metadata.provider,
    model: options.metadata.model,
    startedAt: options.metadata.startedAt,
    finishedAt: options.metadata.finishedAt,
    latencyMs: options.metadata.latencyMs,
    inputTokens: options.metadata.usage.inputTokens,
    outputTokens: options.metadata.usage.outputTokens,
    totalTokens: options.metadata.usage.totalTokens,
    costUsd: options.metadata.usage.costUsd,
    retryCount: options.metadata.retryCount,
    technicalRetryCount: options.metadata.technicalRetryCount,
    reevaluationRetryCount: options.metadata.reevaluationRetryCount,
    failureCode: options.failureCode,
    failureMessage: options.failureMessage,
    failureDetailsJson: safeJson(options.failureDetails ?? []),
    updatedAt: sql`CURRENT_TIMESTAMP`,
  };
  await db
    .insert(p01AnalysisResults)
    .values(values)
    .onConflictDoUpdate({
      target: p01AnalysisResults.analysisRunId,
      set: {
        promptVersion: values.promptVersion,
        outputSchemaVersion: values.outputSchemaVersion,
        ruleVersionsJson: values.ruleVersionsJson,
        inputHash: values.inputHash,
        resultJson: values.resultJson,
        providerRawResponseJson: values.providerRawResponseJson,
        provider: values.provider,
        model: values.model,
        startedAt: values.startedAt,
        finishedAt: values.finishedAt,
        latencyMs: values.latencyMs,
        inputTokens: values.inputTokens,
        outputTokens: values.outputTokens,
        totalTokens: values.totalTokens,
        costUsd: values.costUsd,
        retryCount: values.retryCount,
        technicalRetryCount: values.technicalRetryCount,
        reevaluationRetryCount: values.reevaluationRetryCount,
        failureCode: values.failureCode,
        failureMessage: values.failureMessage,
        failureDetailsJson: values.failureDetailsJson,
        updatedAt: values.updatedAt,
      },
    });
}

export async function executeP01AnalysisRun(
  run: ExecuteP01AnalysisRunInput,
): Promise<ExecuteP01AnalysisRunResult> {
  const input = assertDiagnosticInputForAi(run.input);
  const db = await getDb();
  await db
    .update(analysisRuns)
    .set({ status: "scoring", errorCode: null, errorMessage: null, updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(
      and(
        eq(analysisRuns.id, run.analysisRunId),
        eq(analysisRuns.diagnosticId, run.diagnosticId),
      ),
    );

  try {
    const outcome = await runP01EvidenceScorer(input, {
      provider: run.provider,
      moneyNowEnabled: run.moneyNowEnabled ?? false,
    });
    const failureCode = outcome.kind === "blocked" ? outcome.failureCode : null;
    const failureMessage = outcome.kind === "blocked" ? outcome.failureMessage : null;
    await persistP01Record({
      analysisRunId: run.analysisRunId,
      diagnosticId: run.diagnosticId,
      metadata: outcome.metadata,
      result: outcome.result,
      providerRawResponse: outcome.providerRawResponse,
      failureCode,
      failureMessage,
      failureDetails: [],
    });

    const status = outcome.kind === "success" ? "targeting" : "analysis_failed";
    await db
      .update(analysisRuns)
      .set({
        status,
        promptVersionsJson: JSON.stringify({ P01: outcome.metadata.promptVersion }),
        modelMetadataJson: JSON.stringify({
          provider: outcome.metadata.provider,
          model: outcome.metadata.model,
          outputSchemaVersion: outcome.metadata.outputSchemaVersion,
          ruleVersions: outcome.metadata.ruleVersions,
          inputHash: outcome.metadata.inputHash,
          latencyMs: outcome.metadata.latencyMs,
          retryCount: outcome.metadata.retryCount,
          usage: outcome.metadata.usage,
        }),
        errorCode: failureCode,
        errorMessage: failureMessage,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(
        and(
          eq(analysisRuns.id, run.analysisRunId),
          eq(analysisRuns.diagnosticId, run.diagnosticId),
        ),
      );
    return { status, outcome, failureCode, failureMessage, failureDetails: [] };
  } catch (error) {
    const failureCode =
      error instanceof P01RunExecutionError ? error.failureCode : "P01_INTERNAL_ERROR";
    const failureMessage = error instanceof Error ? error.message : "Unexpected P-01 failure";
    if (error instanceof P01RunExecutionError) {
      await persistP01Record({
        analysisRunId: run.analysisRunId,
        diagnosticId: run.diagnosticId,
        metadata: error.metadata,
        result: null,
        providerRawResponse: error.providerRawResponse,
        failureCode,
        failureMessage,
        failureDetails: error.failureDetails,
      });
    }
    await db
      .update(analysisRuns)
      .set({
        status: "analysis_failed",
        ...(error instanceof P01RunExecutionError
          ? {
              promptVersionsJson: JSON.stringify({ P01: error.metadata.promptVersion }),
              modelMetadataJson: JSON.stringify({
                provider: error.metadata.provider,
                model: error.metadata.model,
                outputSchemaVersion: error.metadata.outputSchemaVersion,
                ruleVersions: error.metadata.ruleVersions,
                inputHash: error.metadata.inputHash,
                latencyMs: error.metadata.latencyMs,
                retryCount: error.metadata.retryCount,
                usage: error.metadata.usage,
              }),
            }
          : {}),
        errorCode: failureCode,
        errorMessage: failureMessage,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(
        and(
          eq(analysisRuns.id, run.analysisRunId),
          eq(analysisRuns.diagnosticId, run.diagnosticId),
        ),
      );
    return {
      status: "analysis_failed",
      outcome: null,
      failureCode,
      failureMessage,
      failureDetails: error instanceof P01RunExecutionError ? error.failureDetails : [],
    };
  }
}
