import { getDb } from "@/db";
import { analysisRuns, diagnostics, p01AnalysisResults } from "@/db/schema";
import { validateDiagnosticInput } from "@/lib/diagnostic-input";
import { analysisRunAccessErrorResponse, requireAnalysisRunAccess } from "@/server/analysis-runs";
import { executeP01AnalysisRun } from "@/server/p01/analysis-run-service";
import { and, eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    await requireAnalysisRunAccess(request, analysisRunId, { ownerOnly: true });
  } catch (error) {
    return analysisRunAccessErrorResponse(error) ?? Response.json({ error: "ANALYSIS_RUN_ACCESS_FAILED" }, { status: 500 });
  }
  const db = await getDb();
  const rows = await db
    .select({
      runId: analysisRuns.id,
      diagnosticId: diagnostics.id,
      status: analysisRuns.status,
      normalizedInputJson: diagnostics.normalizedInputJson,
    })
    .from(analysisRuns)
    .innerJoin(diagnostics, eq(analysisRuns.diagnosticId, diagnostics.id))
    .where(eq(analysisRuns.id, analysisRunId))
    .limit(1);
  const run = rows[0];
  if (!run) return Response.json({ error: "analysis_run_not_found" }, { status: 404 });

  if (run.status === "targeting") {
    const stored = await db
      .select({ resultJson: p01AnalysisResults.resultJson })
      .from(p01AnalysisResults)
      .where(
        and(
          eq(p01AnalysisResults.analysisRunId, analysisRunId),
          eq(p01AnalysisResults.diagnosticId, run.diagnosticId),
        ),
      )
      .limit(1);
    return Response.json({
      analysisRunId,
      status: "targeting",
      result: stored[0]?.resultJson ? JSON.parse(stored[0].resultJson) : null,
      nextStep: {
        method: "POST",
        href: `/api/analysis-runs/${analysisRunId}/target-archetype`,
        module: "target-archetype-stage.v1",
      },
    });
  }
  if (run.status !== "queued") {
    return Response.json(
      { error: "analysis_run_not_queued", status: run.status },
      { status: 409 },
    );
  }

  const input = validateDiagnosticInput(JSON.parse(run.normalizedInputJson));
  const executed = await executeP01AnalysisRun({
    analysisRunId,
    diagnosticId: run.diagnosticId,
    input,
  });
  if (executed.status === "analysis_failed") {
    return Response.json(
      {
        analysisRunId,
        status: executed.status,
        failureCode: executed.failureCode,
        failureMessage: executed.failureMessage,
      },
      { status: 422 },
    );
  }
  return Response.json({
    analysisRunId,
    status: executed.status,
    result: executed.outcome?.result ?? null,
    nextStep: {
      method: "POST",
      href: `/api/analysis-runs/${analysisRunId}/target-archetype`,
      module: "target-archetype-stage.v1",
    },
  });
}
