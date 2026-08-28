import { P04Error, runP04Stage } from "@/server/p04";
import { ANALYSIS_FEATURES } from "@/server/analysis-features";
import {
  authorizeP04PublicRequest,
  loadP04PublicGuardEnvironment,
} from "@/server/p04/public-guard";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

/**
 * Internal/orchestrator stage endpoint. It never returns the paid P-04 report,
 * source registry, upstream snapshots or provider response.
 */
export async function POST(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  const guard = authorizeP04PublicRequest(
    request,
    await loadP04PublicGuardEnvironment(),
  );
  if (!guard.allowed) {
    return Response.json(
      { error: guard.code, message: guard.message },
      { status: guard.status },
    );
  }
  try {
    const executed = await runP04Stage(analysisRunId, {
      moneyNowEnabled: ANALYSIS_FEATURES.moneyNowGeneration,
    });
    if (executed.status === "analysis_failed") {
      return Response.json({
        status: executed.status,
        nextStep: null,
        idempotentReplay: executed.idempotentReplay,
      }, { status: 422 });
    }
    return Response.json({
      status: executed.status,
      nextStep: null,
      idempotentReplay: executed.idempotentReplay,
    });
  } catch (error) {
    if (error instanceof P04Error) {
      const status = error.code === "P04_ANALYSIS_RUN_NOT_FOUND"
        ? 404
        : error.kind === "technical"
          ? 500
          : 409;
      return Response.json({
        error: error.code,
        message: status === 404
          ? "Analysis run was not found."
          : status === 500
            ? "P-04 report could not be completed."
            : "P-04 request could not be accepted.",
      }, { status });
    }
    return Response.json(
      { error: "P04_TECHNICAL_ERROR", message: "Report Writer failed." },
      { status: 500 },
    );
  }
}
