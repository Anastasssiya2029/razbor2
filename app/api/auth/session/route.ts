import { getAuthenticatedUser } from "@/server/auth/service";

export async function GET(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return Response.json({ user: null }, { status: 401, headers: { "cache-control": "no-store" } });
  }
  return Response.json({ user }, { headers: { "cache-control": "no-store" } });
}
