import { AppAuthError } from "./service";
import { SupabaseAuthError } from "./supabase";

export function authErrorResponse(error: unknown): Response {
  if (error instanceof SyntaxError) {
    return Response.json({ error: "INVALID_JSON", message: "Некорректный запрос." }, { status: 400 });
  }
  if (error instanceof AppAuthError) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status });
  }
  if (error instanceof SupabaseAuthError) {
    const status = error.code === "AUTH_NOT_CONFIGURED" || error.code === "PROVIDER_UNAVAILABLE" ? 503 : 401;
    return Response.json({ error: error.code, message: error.message }, { status });
  }
  return Response.json({ error: "AUTH_TECHNICAL_ERROR", message: "Вход временно недоступен." }, { status: 500 });
}

export function requestUsesSecureCookies(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === "https:";
}
