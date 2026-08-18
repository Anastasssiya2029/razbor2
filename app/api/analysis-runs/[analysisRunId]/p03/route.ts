import { P03Error, runP03Stage } from "@/server/p03";
import {
  authorizeP03PublicRequest,
  loadP03PublicGuardEnvironment,
} from "@/server/p03/public-guard";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

/**
 * Public-safe stage endpoint. The full prescription, diagnosis, interventions,
 * metrics, revenue object and provider payload stay in server-side storage.
 */
export async function POST(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  const guard = authorizeP03PublicRequest(
    request,
    await loadP03PublicGuardEnvironment(),
  );
  if (!guard.allowed) {
    return Response.json(
      { error: guard.code, message: guard.message },
      { status: guard.status },
    );
  }
  try {
    const executed = await runP03Stage(analysisRunId);
    if (executed.status === "analysis_failed") {
      return Response.json({
        analysisRunId,
        status: executed.status,
        outcomeStatus: executed.outcomeStatus,
        error: executed.result.failureCode ?? "P03_ANALYSIS_FAILED",
        message: "P-03 analysis could not be completed.",
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
      return Response.json({
        error: error.code,
        message: status === 404
          ? "Analysis run was not found."
          : status === 500
            ? "P-03 analysis could not be completed."
            : "P-03 request could not be accepted.",
      }, { status });
    }
    return Response.json(
      { error: "P03_TECHNICAL_ERROR", message: "Money Now Prescription failed." },
      { status: 500 },
    );
  }
}
