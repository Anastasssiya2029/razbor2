import { getDb } from "@/db";
import { analysisRuns } from "@/db/schema";
import { analysisRunAccessErrorResponse, requireAnalysisRunAccess } from "@/server/analysis-runs";
import { drawAnalysisGift, getAnalysisGift, type GiftTariff } from "@/server/gifts";
import { eq } from "drizzle-orm";

type RouteContext = { params: Promise<{ analysisRunId: string }> };

async function ready(analysisRunId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select({ status: analysisRuns.status }).from(analysisRuns).where(eq(analysisRuns.id, analysisRunId)).limit(1);
  return rows[0]?.status === "ready";
}

export async function GET(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    const actor = await requireAnalysisRunAccess(request, analysisRunId);
    let owner = true;
    try { await requireAnalysisRunAccess(request, analysisRunId, { ownerOnly: true }); } catch { owner = false; }
    return Response.json({ gift: await getAnalysisGift(analysisRunId), canDraw: owner && await ready(analysisRunId), actorRole: actor.role }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return analysisRunAccessErrorResponse(error) ?? Response.json({ error: "GIFT_READ_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  try {
    const actor = await requireAnalysisRunAccess(request, analysisRunId, { ownerOnly: true });
    if (!await ready(analysisRunId)) return Response.json({ error: "ANALYSIS_NOT_READY", message: "Сначала завершите разбор." }, { status: 409 });
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
