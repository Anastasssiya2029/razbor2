import { Stage4Error, runTargetAndArchetypeStage } from "@/server/stage4";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    const executed = await runTargetAndArchetypeStage(analysisRunId);
    if (executed.status === "analysis_failed") {
      return Response.json(
        {
          analysisRunId,
          status: executed.status,
          failureCode: executed.result.failureCode,
          failureMessage: executed.result.failureMessage,
          idempotentReplay: executed.idempotentReplay,
        },
        { status: 422 },
      );
    }
    return Response.json({
      analysisRunId,
      status: executed.status,
      idempotentReplay: executed.idempotentReplay,
      result: {
        currentScores: executed.result.currentScores,
        target: executed.result.target,
        archetype: executed.result.archetype,
        resourceVersions: executed.result.resourceVersions,
      },
      readyFor: "P-02",
      nextStep: {
        method: "POST",
        href: `/api/analysis-runs/${analysisRunId}/p02`,
        module: "P-02.v1.3",
      },
    });
  } catch (error) {
    if (error instanceof Stage4Error) {
      const status = error.code === "STAGE4_ANALYSIS_RUN_NOT_FOUND" ? 404 : 409;
      return Response.json(
        { error: error.code, message: error.message, details: error.details },
        { status },
      );
    }
    return Response.json(
      { error: "STAGE4_TECHNICAL_ERROR", message: "Target/Archetype stage failed." },
      { status: 500 },
    );
  }
}
