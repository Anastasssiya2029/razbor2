import { authErrorResponse } from "@/server/auth/http";
import { registerInvitedAccount } from "@/server/auth/service";

export async function POST(request: Request) {
  try {
    const result = await registerInvitedAccount(await request.json());
    return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
