import { authErrorResponse } from "@/server/auth/http";
import { resetPassword } from "@/server/auth/service";

export async function POST(request: Request) {
  try {
    await resetPassword(await request.json());
    return Response.json(
      { ok: true },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
