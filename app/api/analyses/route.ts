import { authErrorResponse } from "@/server/auth/http";
import { requireAuthenticatedUser } from "@/server/auth";
import { listAnalyses } from "@/server/analyses";

export async function GET(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    return Response.json({ analyses: await listAnalyses(actor) }, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
