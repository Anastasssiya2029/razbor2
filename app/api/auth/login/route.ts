import { authErrorResponse, requestUsesSecureCookies } from "@/server/auth/http";
import { loginWithPassword } from "@/server/auth/service";
import { APP_SESSION_TTL_SECONDS, sessionCookie } from "@/server/auth/session";

export async function POST(request: Request) {
  try {
    const authenticated = await loginWithPassword(await request.json());
    return Response.json(
      { user: authenticated.user, expiresAt: authenticated.expiresAt },
      {
        headers: {
          "cache-control": "no-store",
          "set-cookie": sessionCookie(
            authenticated.token,
            APP_SESSION_TTL_SECONDS,
            requestUsesSecureCookies(request),
          ),
        },
      },
    );
  } catch (error) {
    return authErrorResponse(error);
  }
}
