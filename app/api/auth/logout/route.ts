import { requestUsesSecureCookies } from "@/server/auth/http";
import { logoutRequest } from "@/server/auth/service";
import { clearSessionCookie } from "@/server/auth/session";

export async function POST(request: Request) {
  await logoutRequest(request);
  return Response.json(
    { success: true },
    {
      headers: {
        "cache-control": "no-store",
        "set-cookie": clearSessionCookie(requestUsesSecureCookies(request)),
      },
    },
  );
}
