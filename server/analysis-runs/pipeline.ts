import { getDb } from "@/db";
import { analysisRunLocks, analysisRuns, diagnostics } from "@/db/schema";
import { validateDiagnosticInput, type DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import { ANALYSIS_FEATURES } from "@/server/analysis-features";
import { getOrCreateAnalysisResult, type AnalysisResultV1 } from "@/server/analysis-result";
import { runMoneyNowSelectorStage } from "@/server/money-now-selector";
import { runP02Stage } from "@/server/p02";
import { executeP01AnalysisRun } from "@/server/p01/analysis-run-service";
import { runP03Stage } from "@/server/p03";
import { runP04Stage } from "@/server/p04";
import { runTargetAndArchetypeStage } from "@/server/stage4";
import { runTaskResolverStage } from "@/server/task-resolver";
import { and, eq, lte } from "drizzle-orm";

const PIPELINE_LOCK_SECONDS = 9 * 60;

export type AnalysisPipelineStatus =
  | "draft"
  | "queued"
  | "scoring"
  | "targeting"
  | "strategizing"
  | "resolving_tasks"
  | "money_now"
  | "writing_report"
  | "ready"
  | "analysis_failed";

export type PipelineRunSnapshot = {
  analysisRunId: string;
  diagnosticId: string;
  status: AnalysisPipelineStatus;
  input: DiagnosticInputV1_2;
  errorCode: string | null;
};

export class AnalysisPipelineError extends Error {
  constructor(
    readonly code:
      | "ANALYSIS_RUN_NOT_FOUND"
      | "ANALYSIS_RUN_NOT_SUBMITTED"
      | "ANALYSIS_RUN_BUSY"
      | "ANALYSIS_RUN_FAILED"
      | "ANALYSIS_PIPELINE_STATE_INVALID",
    readonly status: 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = "AnalysisPipelineError";
  }
}

type StageStatusResult = { status: string };

export type AnalysisPipelineDependencies = {
  loadRun(analysisRunId: string): Promise<PipelineRunSnapshot | null>;
  acquireLock(analysisRunId: string): Promise<string | null>;
  releaseLock(analysisRunId: string, token: string): Promise<void>;
  runP01(snapshot: PipelineRunSnapshot): Promise<StageStatusResult>;
  runTarget(analysisRunId: string): Promise<StageStatusResult>;
  runP02(analysisRunId: string): Promise<StageStatusResult>;
  resolveTasks(analysisRunId: string): Promise<StageStatusResult>;
  selectMoneyNow(analysisRunId: string): Promise<StageStatusResult>;
  runP03(analysisRunId: string): Promise<StageStatusResult>;
  runP04(analysisRunId: string): Promise<StageStatusResult>;
  assemble(analysisRunId: string): Promise<{ result: AnalysisResultV1; idempotentReplay: boolean }>;
};

async function loadRun(analysisRunId: string): Promise<PipelineRunSnapshot | null> {
  const db = await getDb();
  const rows = await db
    .select({
      analysisRunId: analysisRuns.id,
      diagnosticId: analysisRuns.diagnosticId,
      status: analysisRuns.status,
      normalizedInputJson: diagnostics.normalizedInputJson,
      errorCode: analysisRuns.errorCode,
    })
    .from(analysisRuns)
    .innerJoin(diagnostics, eq(analysisRuns.diagnosticId, diagnostics.id))
    .where(eq(analysisRuns.id, analysisRunId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    analysisRunId: row.analysisRunId,
    diagnosticId: row.diagnosticId,
    status: row.status as AnalysisPipelineStatus,
    input: validateDiagnosticInput(JSON.parse(row.normalizedInputJson)),
    errorCode: row.errorCode,
  };
}

async function acquireLock(analysisRunId: string): Promise<string | null> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  await db.delete(analysisRunLocks).where(lte(analysisRunLocks.expiresAt, now));
  const token = crypto.randomUUID();
  const inserted = await db
    .insert(analysisRunLocks)
    .values({ analysisRunId, token, expiresAt: now + PIPELINE_LOCK_SECONDS })
    .onConflictDoNothing({ target: analysisRunLocks.analysisRunId })
    .returning({ token: analysisRunLocks.token });
  return inserted[0]?.token ?? null;
}

async function releaseLock(analysisRunId: string, token: string): Promise<void> {
  const db = await getDb();
  await db.delete(analysisRunLocks).where(and(
    eq(analysisRunLocks.analysisRunId, analysisRunId),
    eq(analysisRunLocks.token, token),
  ));
}

export const defaultAnalysisPipelineDependencies: AnalysisPipelineDependencies = {
  loadRun,
  acquireLock,
  releaseLock,
  runP01: (snapshot) => executeP01AnalysisRun({
    analysisRunId: snapshot.analysisRunId,
    diagnosticId: snapshot.diagnosticId,
    input: snapshot.input,
    moneyNowEnabled: ANALYSIS_FEATURES.moneyNowGeneration,
  }),
  runTarget: runTargetAndArchetypeStage,
  runP02: runP02Stage,
  resolveTasks: runTaskResolverStage,
  selectMoneyNow: runMoneyNowSelectorStage,
  runP03: runP03Stage,
  runP04: (analysisRunId) => runP04Stage(analysisRunId, {
    moneyNowEnabled: ANALYSIS_FEATURES.moneyNowGeneration,
  }),
  assemble: getOrCreateAnalysisResult,
};

function assertStage(status: string, expected: AnalysisPipelineStatus, code: string): void {
  if (status === "analysis_failed") {
    throw new AnalysisPipelineError("ANALYSIS_RUN_FAILED", 422, `Этап ${code} не завершён.`);
  }
  if (status !== expected) {
    throw new AnalysisPipelineError("ANALYSIS_PIPELINE_STATE_INVALID", 409, `Этап ${code} вернул недопустимое состояние.`);
  }
}

export async function runAnalysisPipeline(
  analysisRunId: string,
  dependencies: AnalysisPipelineDependencies = defaultAnalysisPipelineDependencies,
): Promise<{ status: "ready"; result: AnalysisResultV1; idempotentReplay: boolean }> {
  let snapshot = await dependencies.loadRun(analysisRunId);
  if (!snapshot) throw new AnalysisPipelineError("ANALYSIS_RUN_NOT_FOUND", 404, "Разбор не найден.");
  if (snapshot.status === "draft") {
    throw new AnalysisPipelineError("ANALYSIS_RUN_NOT_SUBMITTED", 409, "Сначала отправьте анкету на анализ.");
  }
  if (snapshot.status === "analysis_failed") {
    throw new AnalysisPipelineError("ANALYSIS_RUN_FAILED", 422, "Разбор завершился ошибкой.");
  }

  const lockToken = await dependencies.acquireLock(analysisRunId);
  if (!lockToken) throw new AnalysisPipelineError("ANALYSIS_RUN_BUSY", 409, "Разбор уже выполняется.");
  try {
    snapshot = await dependencies.loadRun(analysisRunId);
    if (!snapshot) throw new AnalysisPipelineError("ANALYSIS_RUN_NOT_FOUND", 404, "Разбор не найден.");
    if (snapshot.status === "scoring") {
      throw new AnalysisPipelineError("ANALYSIS_RUN_BUSY", 409, "Предыдущий запуск P‑01 ещё не завершён.");
    }
    if (snapshot.status === "queued") {
      const executed = await dependencies.runP01(snapshot);
      assertStage(executed.status, "targeting", "P‑01");
      snapshot.status = "targeting";
    }
    if (snapshot.status === "targeting") {
      const executed = await dependencies.runTarget(analysisRunId);
      assertStage(executed.status, "strategizing", "целевой конфигурации");
      snapshot.status = "strategizing";
    }
    if (snapshot.status === "strategizing") {
      const executed = await dependencies.runP02(analysisRunId);
      assertStage(executed.status, "resolving_tasks", "P‑02");
      snapshot.status = "resolving_tasks";
    }
    if (snapshot.status === "resolving_tasks") {
      const executed = await dependencies.resolveTasks(analysisRunId);
      assertStage(executed.status, "money_now", "подбора задач");
      snapshot.status = "money_now";
    }
    if (snapshot.status === "money_now") {
      const selected = await dependencies.selectMoneyNow(analysisRunId);
      assertStage(selected.status, "money_now", "денежного сценария");
      const prescribed = await dependencies.runP03(analysisRunId);
      assertStage(prescribed.status, "writing_report", "P‑03");
      snapshot.status = "writing_report";
    }
    if (snapshot.status === "writing_report") {
      const executed = await dependencies.runP04(analysisRunId);
      assertStage(executed.status, "ready", "P‑04");
      snapshot.status = "ready";
    }
    if (snapshot.status !== "ready") {
      throw new AnalysisPipelineError("ANALYSIS_PIPELINE_STATE_INVALID", 409, "Разбор находится в неизвестном состоянии.");
    }
    const assembled = await dependencies.assemble(analysisRunId);
    return { status: "ready", ...assembled };
  } finally {
    await dependencies.releaseLock(analysisRunId, lockToken);
  }
}

export async function advanceAnalysisPipeline(
  analysisRunId: string,
  dependencies: AnalysisPipelineDependencies = defaultAnalysisPipelineDependencies,
): Promise<{
  status: Exclude<AnalysisPipelineStatus, "draft">;
  result: AnalysisResultV1 | null;
  idempotentReplay: boolean;
}> {
  let snapshot = await dependencies.loadRun(analysisRunId);
  if (!snapshot) throw new AnalysisPipelineError("ANALYSIS_RUN_NOT_FOUND", 404, "Разбор не найден.");
  if (snapshot.status === "draft") {
    throw new AnalysisPipelineError("ANALYSIS_RUN_NOT_SUBMITTED", 409, "Сначала отправьте анкету на анализ.");
  }
  if (snapshot.status === "analysis_failed") {
    throw new AnalysisPipelineError("ANALYSIS_RUN_FAILED", 422, "Разбор завершился ошибкой.");
  }

  const lockToken = await dependencies.acquireLock(analysisRunId);
  if (!lockToken) throw new AnalysisPipelineError("ANALYSIS_RUN_BUSY", 409, "Разбор уже выполняется.");
  try {
    snapshot = await dependencies.loadRun(analysisRunId);
    if (!snapshot) throw new AnalysisPipelineError("ANALYSIS_RUN_NOT_FOUND", 404, "Разбор не найден.");
    if (snapshot.status === "scoring") {
      throw new AnalysisPipelineError("ANALYSIS_RUN_BUSY", 409, "Предыдущий запуск P‑01 ещё не завершён.");
    }
    if (snapshot.status === "queued") {
      const executed = await dependencies.runP01(snapshot);
      assertStage(executed.status, "targeting", "P‑01");
      return { status: "targeting", result: null, idempotentReplay: false };
    }
    if (snapshot.status === "targeting") {
      const executed = await dependencies.runTarget(analysisRunId);
      assertStage(executed.status, "strategizing", "целевой конфигурации");
      return { status: "strategizing", result: null, idempotentReplay: false };
    }
    if (snapshot.status === "strategizing") {
      const executed = await dependencies.runP02(analysisRunId);
      assertStage(executed.status, "resolving_tasks", "P‑02");
      return { status: "resolving_tasks", result: null, idempotentReplay: false };
    }
    if (snapshot.status === "resolving_tasks") {
      const executed = await dependencies.resolveTasks(analysisRunId);
      assertStage(executed.status, "money_now", "подбора задач");
      return { status: "money_now", result: null, idempotentReplay: false };
    }
    if (snapshot.status === "money_now") {
      const selected = await dependencies.selectMoneyNow(analysisRunId);
      assertStage(selected.status, "money_now", "денежного сценария");
      const prescribed = await dependencies.runP03(analysisRunId);
      assertStage(prescribed.status, "writing_report", "P‑03");
      return { status: "writing_report", result: null, idempotentReplay: false };
    }
    if (snapshot.status === "writing_report") {
      const executed = await dependencies.runP04(analysisRunId);
      assertStage(executed.status, "ready", "P‑04");
      const assembled = await dependencies.assemble(analysisRunId);
      return { status: "ready", ...assembled };
    }
    if (snapshot.status === "ready") {
      const assembled = await dependencies.assemble(analysisRunId);
      return { status: "ready", ...assembled };
    }
    throw new AnalysisPipelineError("ANALYSIS_PIPELINE_STATE_INVALID", 409, "Разбор находится в неизвестном состоянии.");
  } finally {
    await dependencies.releaseLock(analysisRunId, lockToken);
  }
}
