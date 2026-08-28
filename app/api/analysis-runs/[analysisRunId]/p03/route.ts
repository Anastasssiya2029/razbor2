type RouteContext = { params: Promise<{ analysisRunId: string }> };

/**
 * Money Now is intentionally disabled for this release. Keeping this route as
 * an explicit terminal response prevents old clients from starting a paid
 * legacy stage and keeps that stage out of the Worker startup graph.
 */
export async function POST(_request: Request, context: RouteContext) {
  const { analysisRunId } = await context.params;
  return Response.json(
    {
      analysisRunId,
      error: "MONEY_NOW_DISABLED",
      message: "Блок «Быстрые деньги» отключён в текущей версии сервиса.",
    },
    { status: 410 },
  );
}
