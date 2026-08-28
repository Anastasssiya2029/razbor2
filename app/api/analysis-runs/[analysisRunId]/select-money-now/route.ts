type RouteContext = { params: Promise<{ analysisRunId: string }> };

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
