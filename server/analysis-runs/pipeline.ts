import { getDb } from "@/db";
import { analysisRunLocks, analysisRuns, diagnostics, p01AnalysisResults } from "@/db/schema";
import { validateDiagnosticInput, type DiagnosticInputV1_2 } from "@/lib/diagnostic-input";
import { ANALYSIS_FEATURES } from "@/server/analysis-features";
import { getOrCreateAnalysisResult, type AnalysisResultV1 } from "@/server/analysis-result";
import { runP02Stage } from "@/server/p02";
import { executeP01AnalysisRun } from "@/server/p01/analysis-run-service";
import { runP04Stage } from "@/server/p04";
import { runTargetAndArchetypeStage } from "@/server/stage4";
import { runTaskResolverStage } from "@/server/task-resolver";
import { and, eq, gt, lte } from "drizzle-orm";

export const PIPELINE_LOCK_LEASE_SECONDS = 60;
export const PIPELINE_LOCK_HEARTBEAT_MS = 15_000;

export type PipelineLockAttempt =
  | { acquired: true; token: string }
  | { acquired: false; retryAfterSeconds: number };

export type PipelineLockStatus = {
  busy: boolean;
  retryAfterSeconds: number;
};

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
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "AnalysisPipelineError";
  }
}

type StageStatusResult = { status: string };

export type AnalysisPipelineDependencies = {
  loadRun(analysisRunId: string): Promise<PipelineRunSnapshot | null>;
  recoverInterruptedScoring(snapshot: PipelineRunSnapshot): Promise<PipelineRunSnapshot>;
  acquireLock(analysisRunId: string): Promise<PipelineLockAttempt>;
  renewLock(analysisRunId: string, token: string): Promise<boolean>;
  releaseLock(analysisRunId: string, token: string): Promise<void>;
  lockHeartbeatMs?: number;
  runP01(snapshot: PipelineRunSnapshot): Promise<StageStatusResult>;
  runTarget(analysisRunId: string): Promise<StageStatusResult>;
  runP02(analysisRunId: string): Promise<StageStatusResult>;
  retryP02(analysisRunId: string): Promise<StageStatusResult>;
  retryP04(analysisRunId: string): Promise<StageStatusResult>;
  resolveTasks(analysisRunId: string): Promise<StageStatusResult>;
  selectMoneyNow(analysisRunId: string): Promise<StageStatusResult>;
  runP03(analysisRunId: string): Promise<StageStatusResult>;
  runP04(analysisRunId: string): Promise<StageStatusResult>;
  assemble(analysisRunId: string): Promise<{ result: AnalysisResultV1; idempotentReplay: boolean }>;
  moneyNowEnabled?: boolean;
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

async function recoverInterruptedScoring(
  snapshot: PipelineRunSnapshot,
): Promise<PipelineRunSnapshot> {
  if (snapshot.status !== "scoring") return snapshot;
  const db = await getDb();
  const stored = await db
    .select({
      resultJson: p01AnalysisResults.resultJson,
      failureCode: p01AnalysisResults.failureCode,
    })
    .from(p01AnalysisResults)
    .where(eq(p01AnalysisResults.analysisRunId, snapshot.analysisRunId))
    .limit(1);

  const recoveredStatus: AnalysisPipelineStatus = stored[0]?.resultJson
    ? "targeting"
    : stored[0]?.failureCode
      ? "analysis_failed"
      : "queued";
  await db
    .update(analysisRuns)
    .set({
      status: recoveredStatus,
      errorCode: stored[0]?.failureCode ?? null,
      errorMessage: stored[0]?.failureCode
        ? "Предыдущая попытка P-01 завершилась ошибкой."
        : null,
    })
    .where(and(
      eq(analysisRuns.id, snapshot.analysisRunId),
      eq(analysisRuns.status, "scoring"),
    ));
  return {
    ...snapshot,
    status: recoveredStatus,
    errorCode: stored[0]?.failureCode ?? null,
  };
}

async function acquireLock(analysisRunId: string): Promise<PipelineLockAttempt> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  await db.delete(analysisRunLocks).where(lte(analysisRunLocks.expiresAt, now));
  const token = crypto.randomUUID();
  const inserted = await db
    .insert(analysisRunLocks)
    .values({ analysisRunId, token, expiresAt: now + PIPELINE_LOCK_LEASE_SECONDS })
    .onConflictDoNothing({ target: analysisRunLocks.analysisRunId })
    .returning({ token: analysisRunLocks.token });
  if (inserted[0]?.token) return { acquired: true, token: inserted[0].token };

  const active = await db
    .select({ expiresAt: analysisRunLocks.expiresAt })
    .from(analysisRunLocks)
    .where(eq(analysisRunLocks.analysisRunId, analysisRunId))
    .limit(1);
  return {
    acquired: false,
    retryAfterSeconds: Math.max(1, (active[0]?.expiresAt ?? now + 1) - now),
  };
}

async function renewLock(analysisRunId: string, token: string): Promise<boolean> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  const renewed = await db
    .update(analysisRunLocks)
    .set({ expiresAt: now + PIPELINE_LOCK_LEASE_SECONDS })
    .where(and(
      eq(analysisRunLocks.analysisRunId, analysisRunId),
      eq(analysisRunLocks.token, token),
      gt(analysisRunLocks.expiresAt, now),
    ))
    .returning({ token: analysisRunLocks.token });
  return renewed[0]?.token === token;
}

async function releaseLock(analysisRunId: string, token: string): Promise<void> {
  const db = await getDb();
  await db.delete(analysisRunLocks).where(and(
    eq(analysisRunLocks.analysisRunId, analysisRunId),
    eq(analysisRunLocks.token, token),
  ));
}

export async function getAnalysisPipelineLockStatus(
  analysisRunId: string,
): Promise<PipelineLockStatus> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  await db.delete(analysisRunLocks).where(and(
    eq(analysisRunLocks.analysisRunId, analysisRunId),
    lte(analysisRunLocks.expiresAt, now),
  ));
  const active = await db
    .select({ expiresAt: analysisRunLocks.expiresAt })
    .from(analysisRunLocks)
    .where(eq(analysisRunLocks.analysisRunId, analysisRunId))
    .limit(1);
  if (!active[0]) return { busy: false, retryAfterSeconds: 0 };
  return {
    busy: true,
    retryAfterSeconds: Math.max(1, active[0].expiresAt - now),
  };
}

export const defaultAnalysisPipelineDependencies: AnalysisPipelineDependencies = {
  loadRun,
  recoverInterruptedScoring,
  acquireLock,
  renewLock,
  releaseLock,
  runP01: (snapshot) => executeP01AnalysisRun({
    analysisRunId: snapshot.analysisRunId,
    diagnosticId: snapshot.diagnosticId,
    input: snapshot.input,
    moneyNowEnabled: ANALYSIS_FEATURES.moneyNowGeneration,
  }),
  runTarget: runTargetAndArchetypeStage,
  runP02: runP02Stage,
  retryP02: (analysisRunId) => runP02Stage(analysisRunId, { retryFailed: true }),
  retryP04: (analysisRunId) => runP04Stage(analysisRunId, {
    moneyNowEnabled: ANALYSIS_FEATURES.moneyNowGeneration,
    retryFailed: true,
  }),
  resolveTasks: runTaskResolverStage,
  // Money Now is disabled for the release. Keep its implementation out of the
  // Worker startup graph; if the feature is deliberately restored later, load
  // the legacy stages only when the enabled branch actually reaches them.
  selectMoneyNow: async (analysisRunId) => {
    const { runMoneyNowSelectorStage } = await import("@/server/money-now-selector");
    return runMoneyNowSelectorStage(analysisRunId);
  },
  runP03: async (analysisRunId) => {
    const { runP03Stage } = await import("@/server/p03");
    return runP03Stage(analysisRunId);
  },
  runP04: (analysisRunId) => runP04Stage(analysisRunId, {
    moneyNowEnabled: ANALYSIS_FEATURES.moneyNowGeneration,
  }),
  assemble: getOrCreateAnalysisResult,
  moneyNowEnabled: ANALYSIS_FEATURES.moneyNowGeneration,
};

async function withPipelineLock<T>(
  analysisRunId: string,
  dependencies: AnalysisPipelineDependencies,
  execute: () => Promise<T>,
): Promise<T> {
  const attempt = await dependencies.acquireLock(analysisRunId);
  if (!attempt.acquired) {
    throw new AnalysisPipelineError(
      "ANALYSIS_RUN_BUSY",
      409,
      "Разбор уже выполняется.",
      attempt.retryAfterSeconds,
    );
  }

  const lockToken = attempt.token;
  let leaseLost = false;
  let heartbeatRunning = false;
  const heartbeat = setInterval(() => {
    if (heartbeatRunning || leaseLost) return;
    heartbeatRunning = true;
    void dependencies.renewLock(analysisRunId, lockToken)
      .then((renewed) => {
        if (!renewed) leaseLost = true;
      })
      .catch(() => {
        // A transient storage error must not trigger a duplicate paid call.
        // The next heartbeat can still renew the active lease.
      })
      .finally(() => {
        heartbeatRunning = false;
      });
  }, dependencies.lockHeartbeatMs ?? PIPELINE_LOCK_HEARTBEAT_MS);
  if (typeof heartbeat === "object" && "unref" in heartbeat) heartbeat.unref();

  try {
    const result = await execute();
    if (leaseLost) {
      throw new AnalysisPipelineError(
        "ANALYSIS_RUN_BUSY",
        409,
        "Выполнение было продолжено другой попыткой; обновите состояние разбора.",
        1,
      );
    }
    return result;
  } finally {
    clearInterval(heartbeat);
    await dependencies.releaseLock(analysisRunId, lockToken);
  }
}

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

  return withPipelineLock(analysisRunId, dependencies, async () => {
    snapshot = await dependencies.loadRun(analysisRunId);
    if (!snapshot) throw new AnalysisPipelineError("ANALYSIS_RUN_NOT_FOUND", 404, "Разбор не найден.");
    if (snapshot.status === "scoring") snapshot = await dependencies.recoverInterruptedScoring(snapshot);
    if (snapshot.status === "analysis_failed") {
      throw new AnalysisPipelineError("ANALYSIS_RUN_FAILED", 422, "Разбор завершился ошибкой.");
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
  });
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

  return withPipelineLock(analysisRunId, dependencies, async () => {
    snapshot = await dependencies.loadRun(analysisRunId);
    if (!snapshot) throw new AnalysisPipelineError("ANALYSIS_RUN_NOT_FOUND", 404, "Разбор не найден.");
    if (snapshot.status === "scoring") snapshot = await dependencies.recoverInterruptedScoring(snapshot);
    if (snapshot.status === "analysis_failed") {
      throw new AnalysisPipelineError("ANALYSIS_RUN_FAILED", 422, "Разбор завершился ошибкой.");
    }
    if (snapshot.status === "queued") {
      const executed = await dependencies.runP01(snapshot);
      assertStage(executed.status, "targeting", "P‑01");
      const targeted = await dependencies.runTarget(analysisRunId);
      assertStage(targeted.status, "strategizing", "целевой конфигурации");
      return { status: "strategizing", result: null, idempotentReplay: false };
    }
    if (snapshot.status === "targeting") {
      const executed = await dependencies.runTarget(analysisRunId);
      assertStage(executed.status, "strategizing", "целевой конфигурации");
      return { status: "strategizing", result: null, idempotentReplay: false };
    }
    if (snapshot.status === "strategizing") {
      const executed = await dependencies.runP02(analysisRunId);
      assertStage(executed.status, "resolving_tasks", "P‑02");
      const resolved = await dependencies.resolveTasks(analysisRunId);
      assertStage(resolved.status, "money_now", "подбора задач");
      const selected = await dependencies.selectMoneyNow(analysisRunId);
      assertStage(selected.status, "money_now", "денежного сценария");
      if (dependencies.moneyNowEnabled ?? ANALYSIS_FEATURES.moneyNowGeneration) {
        // P-03 may use a paid provider when Money Now is enabled. Keep the
        // invariant of at most one provider stage per resumable request.
        return { status: "money_now", result: null, idempotentReplay: false };
      }
      const prescribed = await dependencies.runP03(analysisRunId);
      assertStage(prescribed.status, "writing_report", "P‑03");
      return { status: "writing_report", result: null, idempotentReplay: false };
    }
    if (snapshot.status === "resolving_tasks") {
      const executed = await dependencies.resolveTasks(analysisRunId);
      assertStage(executed.status, "money_now", "подбора задач");
      const selected = await dependencies.selectMoneyNow(analysisRunId);
      assertStage(selected.status, "money_now", "денежного сценария");
      const prescribed = await dependencies.runP03(analysisRunId);
      assertStage(prescribed.status, "writing_report", "P‑03");
      return { status: "writing_report", result: null, idempotentReplay: false };
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
  });
}

export async function retryFailedP02Pipeline(
  analysisRunId: string,
  dependencies: AnalysisPipelineDependencies = defaultAnalysisPipelineDependencies,
): Promise<{ status: "resolving_tasks"; result: null; idempotentReplay: false }> {
  let snapshot = await dependencies.loadRun(analysisRunId);
  if (!snapshot) throw new AnalysisPipelineError("ANALYSIS_RUN_NOT_FOUND", 404, "Разбор не найден.");
  if (
    snapshot.status !== "analysis_failed" ||
    !snapshot.errorCode?.startsWith("P02_") ||
    snapshot.errorCode === "P02_NO_ACTIONABLE_TARGET_GAP"
  ) {
    throw new AnalysisPipelineError(
      "ANALYSIS_PIPELINE_STATE_INVALID",
      409,
      "Повтор без нового расчёта доступен только для ошибки этапа стратегии.",
    );
  }

  return withPipelineLock(analysisRunId, dependencies, async () => {
    snapshot = await dependencies.loadRun(analysisRunId);
    if (!snapshot) throw new AnalysisPipelineError("ANALYSIS_RUN_NOT_FOUND", 404, "Разбор не найден.");
    if (
      snapshot.status !== "analysis_failed" ||
      !snapshot.errorCode?.startsWith("P02_") ||
      snapshot.errorCode === "P02_NO_ACTIONABLE_TARGET_GAP"
    ) {
      throw new AnalysisPipelineError(
        "ANALYSIS_PIPELINE_STATE_INVALID",
        409,
        "Состояние разбора изменилось; обновите страницу.",
      );
    }
    const executed = await dependencies.retryP02(analysisRunId);
    assertStage(executed.status, "resolving_tasks", "повторной стратегии P‑02");
    return { status: "resolving_tasks", result: null, idempotentReplay: false };
  });
}

export async function retryFailedAnalysisPipeline(
  analysisRunId: string,
  dependencies: AnalysisPipelineDependencies = defaultAnalysisPipelineDependencies,
): Promise<{
  status: "resolving_tasks" | "ready";
  result: AnalysisResultV1 | null;
  idempotentReplay: false;
}> {
  let snapshot = await dependencies.loadRun(analysisRunId);
  if (!snapshot) throw new AnalysisPipelineError("ANALYSIS_RUN_NOT_FOUND", 404, "Разбор не найден.");
  const retryP02 = snapshot.status === "analysis_failed"
    && Boolean(snapshot.errorCode?.startsWith("P02_"))
    && snapshot.errorCode !== "P02_NO_ACTIONABLE_TARGET_GAP";
  const retryP04 = snapshot.status === "analysis_failed"
    && Boolean(snapshot.errorCode?.startsWith("P04_"));
  if (!retryP02 && !retryP04) {
    throw new AnalysisPipelineError(
      "ANALYSIS_PIPELINE_STATE_INVALID",
      409,
      "Повтор без нового расчёта доступен только для исправимой ошибки стратегии или финального отчёта.",
    );
  }

  return withPipelineLock(analysisRunId, dependencies, async () => {
    snapshot = await dependencies.loadRun(analysisRunId);
    if (!snapshot) throw new AnalysisPipelineError("ANALYSIS_RUN_NOT_FOUND", 404, "Разбор не найден.");
    if (snapshot.status !== "analysis_failed") {
      throw new AnalysisPipelineError("ANALYSIS_PIPELINE_STATE_INVALID", 409, "Состояние разбора изменилось; обновите страницу.");
    }
    if (snapshot.errorCode?.startsWith("P04_")) {
      const executed = await dependencies.retryP04(analysisRunId);
      assertStage(executed.status, "ready", "повторного финального отчёта P‑04");
      const assembled = await dependencies.assemble(analysisRunId);
      return { status: "ready", result: assembled.result, idempotentReplay: false };
    }
    if (snapshot.errorCode?.startsWith("P02_") && snapshot.errorCode !== "P02_NO_ACTIONABLE_TARGET_GAP") {
      const executed = await dependencies.retryP02(analysisRunId);
      assertStage(executed.status, "resolving_tasks", "повторной стратегии P‑02");
      return { status: "resolving_tasks", result: null, idempotentReplay: false };
    }
    throw new AnalysisPipelineError("ANALYSIS_PIPELINE_STATE_INVALID", 409, "Состояние разбора изменилось; обновите страницу.");
  });
}
