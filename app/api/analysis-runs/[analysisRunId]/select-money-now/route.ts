import {
  MoneyNowSelectorStageError,
  runMoneyNowSelectorStage,
} from "@/server/money-now-selector";
import { analysisRunAccessErrorResponse, requireAnalysisRunAccess } from "@/server/analysis-runs";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    await requireAnalysisRunAccess(request, analysisRunId, { ownerOnly: true });
    const executed = await runMoneyNowSelectorStage(analysisRunId);
    if (executed.status === "analysis_failed") {
      return Response.json(
        {
          analysisRunId,
          status: executed.status,
          failure: executed.result.failure,
          idempotentReplay: executed.idempotentReplay,
          nextStep: null,
        },
        { status: 422 },
      );
    }
    return Response.json({
      analysisRunId,
      status: executed.status,
      idempotentReplay: executed.idempotentReplay,
      result: executed.result.snapshot,
      nextStep: executed.nextStep,
      p03Started: false,
      p04Started: false,
    });
  } catch (error) {
    const accessResponse = analysisRunAccessErrorResponse(error);
    if (accessResponse) return accessResponse;
    if (error instanceof MoneyNowSelectorStageError) {
      const status = error.code === "MONEY_NOW_SELECTOR_ANALYSIS_RUN_NOT_FOUND"
        ? 404
        : error.kind === "technical"
          ? 500
          : 409;
      return Response.json(
        { error: error.code, message: error.message, details: error.details },
        { status },
      );
    }
    return Response.json(
      {
        error: "MONEY_NOW_SELECTOR_TECHNICAL_ERROR",
        message: "Deterministic Money Now Selector failed.",
      },
      { status: 500 },
    );
  }
}
