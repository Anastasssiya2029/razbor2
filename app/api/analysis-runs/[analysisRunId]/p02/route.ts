import { P02Error, runP02Stage } from "@/server/p02";
import { analysisRunAccessErrorResponse, requireAnalysisRunAccess } from "@/server/analysis-runs";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    await requireAnalysisRunAccess(request, analysisRunId, { ownerOnly: true });
    const executed = await runP02Stage(analysisRunId);
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
      result: executed.result.result,
      readyFor: "deterministic-task-resolver",
      taskResolverStarted: false,
      nextStep: {
        method: "POST",
        href: `/api/analysis-runs/${analysisRunId}/resolve-tasks`,
        module: "task-resolver-stage.v1",
      },
    });
  } catch (error) {
    const accessResponse = analysisRunAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof P02Error) {
      const status = error.code === "P02_ANALYSIS_RUN_NOT_FOUND" ? 404 : error.kind === "technical" ? 500 : 409;
      return Response.json({ error: error.code, message: error.message, details: error.details }, { status });
    }
    return Response.json({ error: "P02_TECHNICAL_ERROR", message: "Transition Strategist failed." }, { status: 500 });
  }
}
