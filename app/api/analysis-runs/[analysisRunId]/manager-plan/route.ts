import { analysisRunAccessErrorResponse, requireAnalysisRunAccess } from "@/server/analysis-runs";
import { getManagerPlanVersion, ManagerPlanError, saveManagerPlanVersion } from "@/server/manager-plan";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    await requireAnalysisRunAccess(request, analysisRunId);
    return Response.json(
      { managerPlan: await getManagerPlanVersion(analysisRunId) },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return analysisRunAccessErrorResponse(error)
      ?? Response.json({ error: "MANAGER_PLAN_READ_FAILED", message: "Не удалось открыть версию менеджера." }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    const actor = await requireAnalysisRunAccess(request, analysisRunId);
    const payload = await request.json() as { sourceResultHash?: unknown; content?: unknown };
    if (typeof payload.sourceResultHash !== "string") {
      return Response.json({ error: "MANAGER_PLAN_INVALID", message: "Не найден исходный план." }, { status: 400 });
    }
    const managerPlan = await saveManagerPlanVersion({
      analysisRunId,
      actorUserId: actor.id,
      sourceResultHash: payload.sourceResultHash,
      content: payload.content,
    });
    return Response.json({ managerPlan }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const access = analysisRunAccessErrorResponse(error);
    if (access) return access;
    if (error instanceof SyntaxError) {
      return Response.json({ error: "INVALID_JSON", message: "Некорректный запрос." }, { status: 400 });
    }
    if (error instanceof ManagerPlanError) {
      return Response.json({ error: error.code, message: error.message }, { status: error.status });
    }
    return Response.json({ error: "MANAGER_PLAN_SAVE_FAILED", message: "Не удалось сохранить версию менеджера." }, { status: 500 });
  }
}
