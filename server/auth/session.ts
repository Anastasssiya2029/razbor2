export const APP_SESSION_COOKIE = "razbor_session";
// Managers may prepare a long diagnostic over several working sessions. The
// explicit logout action still revokes the server-side session immediately.
export const APP_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function readSessionToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === APP_SESSION_COOKIE) {
      const value = rawValue.join("=").trim();
      return value || null;
    }
  }
  return null;
}

export function sessionCookie(token: string, maxAge = APP_SESSION_TTL_SECONDS, secure = true): string {
  return `${APP_SESSION_COOKIE}=${token}; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie(secure = true): string {
  return `${APP_SESSION_COOKIE}=; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=0`;
}
