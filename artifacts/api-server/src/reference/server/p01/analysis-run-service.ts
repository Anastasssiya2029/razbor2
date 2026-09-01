import { analysisRunsTable, db, p01AnalysisResultsTable } from "@workspace/db";
import { assertDiagnosticInputForAi, type DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import { and, eq } from "drizzle-orm";
import { withCallLogging } from "@/server/ai/call-log";
import type { P01Provider, P01RunMetadata, P01RunOutcome } from "./types";
import { P01RunExecutionError, runP01EvidenceScorer } from "./runner";
import { createConfiguredP01Provider } from "./provider";

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
  const values = {
    diagnosticId: options.diagnosticId,
    analysisRunId: options.analysisRunId,
    promptVersion: options.metadata.promptVersion,
    outputSchemaVersion: options.metadata.outputSchemaVersion,
    inputHash: options.metadata.inputHash,
    result: options.result as Record<string, unknown> | null,
    providerRawResponse: {
      rawResponse: options.providerRawResponse,
      ruleVersions: options.metadata.ruleVersions,
      failureDetails: options.failureDetails ?? [],
    },
    providerModel: `${options.metadata.provider}:${options.metadata.model}`,
    tokenUsage: {
      ...options.metadata.usage,
      provider: options.metadata.provider,
      model: options.metadata.model,
      latencyMs: options.metadata.latencyMs,
      technicalRetryCount: options.metadata.technicalRetryCount,
      reevaluationRetryCount: options.metadata.reevaluationRetryCount,
    },
    retryCount: options.metadata.retryCount,
    failureCode: options.failureCode,
    failureMessage: options.failureMessage,
    startedAt: new Date(options.metadata.startedAt),
    completedAt: new Date(options.metadata.finishedAt),
  };
  await db
    .insert(p01AnalysisResultsTable)
    .values(values)
    .onConflictDoUpdate({
      target: p01AnalysisResultsTable.analysisRunId,
      set: {
        promptVersion: values.promptVersion,
        outputSchemaVersion: values.outputSchemaVersion,
        inputHash: values.inputHash,
        result: values.result,
        providerRawResponse: values.providerRawResponse,
        providerModel: values.providerModel,
        startedAt: values.startedAt,
        completedAt: values.completedAt,
        tokenUsage: values.tokenUsage,
        retryCount: values.retryCount,
        failureCode: values.failureCode,
        failureMessage: values.failureMessage,
      },
    })
    .returning({ id: p01AnalysisResultsTable.id });
}

export async function executeP01AnalysisRun(
  run: ExecuteP01AnalysisRunInput,
): Promise<ExecuteP01AnalysisRunResult> {
  const input = assertDiagnosticInputForAi(run.input);
  await db
    .update(analysisRunsTable)
    .set({ status: "scoring", errorCode: null, errorMessage: null })
    .where(
      and(
        eq(analysisRunsTable.id, run.analysisRunId),
        eq(analysisRunsTable.diagnosticId, run.diagnosticId),
      ),
    );

  try {
    const provider = run.provider
      ?? withCallLogging(createConfiguredP01Provider(process.env as Record<string, string | undefined>), {
        module: "p01",
        analysisRunId: run.analysisRunId,
      });
    const outcome = await runP01EvidenceScorer(input, {
      provider,
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
    const currentRun = await db
      .select({ metadata: analysisRunsTable.metadata })
      .from(analysisRunsTable)
      .where(eq(analysisRunsTable.id, run.analysisRunId))
      .limit(1);
    await db
      .update(analysisRunsTable)
      .set({
        status,
        metadata: {
          ...(currentRun[0]?.metadata ?? {}),
          promptVersions: { P01: outcome.metadata.promptVersion },
          modelMetadata: {
            provider: outcome.metadata.provider,
            model: outcome.metadata.model,
            outputSchemaVersion: outcome.metadata.outputSchemaVersion,
            ruleVersions: outcome.metadata.ruleVersions,
            inputHash: outcome.metadata.inputHash,
            latencyMs: outcome.metadata.latencyMs,
            retryCount: outcome.metadata.retryCount,
            usage: outcome.metadata.usage,
          },
        },
        errorCode: failureCode,
        errorMessage: failureMessage,
      })
      .where(
        and(
          eq(analysisRunsTable.id, run.analysisRunId),
          eq(analysisRunsTable.diagnosticId, run.diagnosticId),
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
    const currentRun = await db
      .select({ metadata: analysisRunsTable.metadata })
      .from(analysisRunsTable)
      .where(eq(analysisRunsTable.id, run.analysisRunId))
      .limit(1);
    await db
      .update(analysisRunsTable)
      .set({
        status: "analysis_failed",
        ...(error instanceof P01RunExecutionError
          ? {
              metadata: {
                ...(currentRun[0]?.metadata ?? {}),
                promptVersions: { P01: error.metadata.promptVersion },
                modelMetadata: {
                  provider: error.metadata.provider,
                  model: error.metadata.model,
                  outputSchemaVersion: error.metadata.outputSchemaVersion,
                  ruleVersions: error.metadata.ruleVersions,
                  inputHash: error.metadata.inputHash,
                  latencyMs: error.metadata.latencyMs,
                  retryCount: error.metadata.retryCount,
                  usage: error.metadata.usage,
                },
              },
            }
          : {}),
        errorCode: failureCode,
        errorMessage: failureMessage,
      })
      .where(
        and(
          eq(analysisRunsTable.id, run.analysisRunId),
          eq(analysisRunsTable.diagnosticId, run.diagnosticId),
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
