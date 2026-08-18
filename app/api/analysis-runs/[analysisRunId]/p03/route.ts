import { P03Error, runP03Stage } from "@/server/p03";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

/**
 * Public-safe stage endpoint. The full prescription, diagnosis, interventions,
 * metrics, revenue object and provider payload stay in server-side storage.
 */
export async function POST(_request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    const executed = await runP03Stage(analysisRunId);
    if (executed.status === "analysis_failed") {
      return Response.json({
        analysisRunId,
        status: executed.status,
        outcomeStatus: executed.outcomeStatus,
        failureCode: executed.result.failureCode,
        failureMessage: executed.result.failureMessage,
        idempotentReplay: executed.idempotentReplay,
        nextStep: null,
        p04Started: false,
      }, { status: 422 });
    }
    return Response.json({
      analysisRunId,
      status: executed.status,
      outcomeStatus: executed.outcomeStatus,
      lockedTeaser: executed.publicTeaser,
      idempotentReplay: executed.idempotentReplay,
      nextStep: {
        method: "POST",
        href: executed.nextStep,
        module: "P-04-not-started",
      },
      p04Started: false,
    });
  } catch (error) {
    if (error instanceof P03Error) {
      const status = error.code === "P03_ANALYSIS_RUN_NOT_FOUND"
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
      { error: "P03_TECHNICAL_ERROR", message: "Money Now Prescription failed." },
      { status: 500 },
    );
  }
}

