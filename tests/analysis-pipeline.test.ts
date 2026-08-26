import assert from "node:assert/strict";
import test from "node:test";
import {
  AnalysisPipelineError,
  advanceAnalysisPipeline,
  retryFailedP02Pipeline,
  runAnalysisPipeline,
  type AnalysisPipelineDependencies,
  type AnalysisPipelineStatus,
  type PipelineRunSnapshot,
} from "../server/analysis-runs/pipeline";
import type { AnalysisResultV1 } from "../server/analysis-result/types";

const fakeResult = { analysisRunId: "run-1" } as unknown as AnalysisResultV1;

function pipelineHarness(initialStatus: AnalysisPipelineStatus, options: { lock?: string | null } = {}) {
  const calls: string[] = [];
  let status = initialStatus;
  const snapshot = (): PipelineRunSnapshot => ({
    analysisRunId: "run-1",
    diagnosticId: "diagnostic-1",
    status,
    input: {} as PipelineRunSnapshot["input"],
    errorCode: null,
  });
  const advance = (name: string, next: AnalysisPipelineStatus) => async () => {
    calls.push(name);
    status = next;
    return { status: next };
  };
  const dependencies: AnalysisPipelineDependencies = {
    loadRun: async () => snapshot(),
    acquireLock: async () => {
      calls.push("lock");
      return options.lock === undefined ? "lock-token" : options.lock;
    },
    releaseLock: async (_analysisRunId, token) => {
      calls.push(`unlock:${token}`);
    },
    runP01: async () => advance("p01", "targeting")(),
    runTarget: advance("target", "strategizing"),
    runP02: advance("p02", "resolving_tasks"),
    retryP02: advance("p02-retry", "resolving_tasks"),
    resolveTasks: advance("tasks", "money_now"),
    selectMoneyNow: async () => {
      calls.push("money-selector");
      return { status: "money_now" };
    },
    runP03: advance("p03", "writing_report"),
    runP04: advance("p04", "ready"),
    assemble: async () => {
      calls.push("assemble");
      return { result: fakeResult, idempotentReplay: false };
    },
  };
  return { calls, dependencies };
}

test("pipeline executes every module once and in business order", async () => {
  const harness = pipelineHarness("queued");
  const result = await runAnalysisPipeline("run-1", harness.dependencies);
  assert.equal(result.status, "ready");
  assert.equal(result.result, fakeResult);
  assert.deepEqual(harness.calls, [
    "lock",
    "p01",
    "target",
    "p02",
    "tasks",
    "money-selector",
    "p03",
    "p04",
    "assemble",
    "unlock:lock-token",
  ]);
});

test("resumable advance executes at most one provider stage per request", async () => {
  const harness = pipelineHarness("queued");

  const first = await advanceAnalysisPipeline("run-1", harness.dependencies);

  assert.equal(first.status, "targeting");
  assert.equal(first.result, null);
  assert.deepEqual(harness.calls, ["lock", "p01", "unlock:lock-token"]);
});

test("resumable advance continues from persisted state without replaying prior stages", async () => {
  const harness = pipelineHarness("strategizing");

  const advanced = await advanceAnalysisPipeline("run-1", harness.dependencies);

  assert.equal(advanced.status, "resolving_tasks");
  assert.deepEqual(harness.calls, ["lock", "p02", "unlock:lock-token"]);
});

test("resumable advance assembles immediately after the final report stage", async () => {
  const harness = pipelineHarness("writing_report");

  const advanced = await advanceAnalysisPipeline("run-1", harness.dependencies);

  assert.equal(advanced.status, "ready");
  assert.equal(advanced.result, fakeResult);
  assert.deepEqual(harness.calls, [
    "lock",
    "p04",
    "assemble",
    "unlock:lock-token",
  ]);
});

test("ready replay assembles stored result without new AI or deterministic stages", async () => {
  const harness = pipelineHarness("ready");
  await runAnalysisPipeline("run-1", harness.dependencies);
  assert.deepEqual(harness.calls, ["lock", "assemble", "unlock:lock-token"]);
});

test("pipeline resumes at the persisted stage without replaying earlier providers", async () => {
  const harness = pipelineHarness("money_now");
  await runAnalysisPipeline("run-1", harness.dependencies);
  assert.deepEqual(harness.calls, [
    "lock",
    "money-selector",
    "p03",
    "p04",
    "assemble",
    "unlock:lock-token",
  ]);
});

test("concurrent execution is rejected before any provider stage", async () => {
  const harness = pipelineHarness("queued", { lock: null });
  await assert.rejects(
    runAnalysisPipeline("run-1", harness.dependencies),
    (error: unknown) => error instanceof AnalysisPipelineError && error.code === "ANALYSIS_RUN_BUSY",
  );
  assert.deepEqual(harness.calls, ["lock"]);
});

test("failed stage stops the pipeline and always releases the lock", async () => {
  const harness = pipelineHarness("strategizing");
  harness.dependencies.runP02 = async () => {
    harness.calls.push("p02");
    return { status: "analysis_failed" };
  };
  await assert.rejects(
    runAnalysisPipeline("run-1", harness.dependencies),
    (error: unknown) => error instanceof AnalysisPipelineError && error.code === "ANALYSIS_RUN_FAILED",
  );
  assert.deepEqual(harness.calls, ["lock", "p02", "unlock:lock-token"]);
});

test("draft cannot spend provider credits", async () => {
  const harness = pipelineHarness("draft");
  await assert.rejects(
    runAnalysisPipeline("run-1", harness.dependencies),
    (error: unknown) => error instanceof AnalysisPipelineError && error.code === "ANALYSIS_RUN_NOT_SUBMITTED",
  );
  assert.deepEqual(harness.calls, []);
});

test("failed P-02 can retry only that stage under the pipeline lock", async () => {
  const harness = pipelineHarness("analysis_failed");
  const originalLoadRun = harness.dependencies.loadRun;
  harness.dependencies.loadRun = async (analysisRunId) => ({
    ...(await originalLoadRun(analysisRunId))!,
    errorCode: "P02_INVARIANT_FAILED",
  });

  const result = await retryFailedP02Pipeline("run-1", harness.dependencies);

  assert.equal(result.status, "resolving_tasks");
  assert.deepEqual(harness.calls, ["lock", "p02-retry", "unlock:lock-token"]);
});

test("failed non-P02 stage cannot use plan-only retry", async () => {
  const harness = pipelineHarness("analysis_failed");
  await assert.rejects(
    retryFailedP02Pipeline("run-1", harness.dependencies),
    (error: unknown) => error instanceof AnalysisPipelineError
      && error.code === "ANALYSIS_PIPELINE_STATE_INVALID",
  );
  assert.deepEqual(harness.calls, []);
});
