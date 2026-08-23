import { analysisRunAccessErrorResponse, requireAnalysisRunAccess } from "@/server/analysis-runs";
import { drawAnalysisGift, getAnalysisGift, type GiftTariff } from "@/server/gifts";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    const actor = await requireAnalysisRunAccess(request, analysisRunId);
    let owner = true;
    try { await requireAnalysisRunAccess(request, analysisRunId, { ownerOnly: true }); } catch { owner = false; }
    return Response.json({ gift: await getAnalysisGift(analysisRunId), canDraw: owner, actorRole: actor.role }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return analysisRunAccessErrorResponse(error) ?? Response.json({ error: "GIFT_READ_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    const actor = await requireAnalysisRunAccess(request, analysisRunId, { ownerOnly: true });
    const payload = await request.json() as { tariff?: unknown };
    const tariff = payload.tariff === "self" || payload.tariff === "support" ? payload.tariff as GiftTariff : null;
    if (!tariff) return Response.json({ error: "INVALID_TARIFF", message: "Выберите формат участия." }, { status: 400 });
    return Response.json(await drawAnalysisGift({ analysisRunId, tariff, actorUserId: actor.id }));
  } catch (error) {
    const access = analysisRunAccessErrorResponse(error);
    if (access) return access;
    if (error instanceof SyntaxError) return Response.json({ error: "INVALID_JSON" }, { status: 400 });
    return Response.json({ error: "GIFT_DRAW_FAILED", message: "Не удалось закрепить подарок." }, { status: 500 });
  }
}
