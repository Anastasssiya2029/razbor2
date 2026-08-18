import { runTaskResolverStage, TaskResolverError } from "@/server/task-resolver";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    const executed = await runTaskResolverStage(analysisRunId);
    if (executed.status === "analysis_failed") {
      return Response.json({
        analysisRunId,
        status: executed.status,
        failureCode: executed.result.failureCode,
        failureMessage: executed.result.failureMessage,
        idempotentReplay: executed.idempotentReplay,
      }, { status: 422 });
    }
    return Response.json({
      analysisRunId,
      status: executed.status,
      idempotentReplay: executed.idempotentReplay,
      result: executed.result.plan,
      readyFor: "POST /api/analysis-runs/{analysisRunId}/select-money-now",
      moneyNowSelectorStarted: false,
    });
  } catch (error) {
    if (error instanceof TaskResolverError) {
      const status = error.code === "TASK_RESOLVER_ANALYSIS_RUN_NOT_FOUND"
        ? 404
        : error.kind === "technical"
          ? 500
          : 409;
      return Response.json({ error: error.code, message: error.message, details: error.details }, { status });
    }
    return Response.json({ error: "TASK_RESOLVER_TECHNICAL_ERROR", message: "Deterministic Task Resolver failed." }, { status: 500 });
  }
}
