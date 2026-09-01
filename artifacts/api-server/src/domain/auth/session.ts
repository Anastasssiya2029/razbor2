import crypto from "node:crypto";

export const APP_SESSION_COOKIE = "razbor_session";
// Managers may prepare a long diagnostic over several working sessions; the
// explicit logout action still revokes the server-side session immediately.
export const APP_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export function createSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === APP_SESSION_COOKIE) {
      const value = rawValue.join("=").trim();
      return value || null;
    }
  }
  return null;
}

export function sessionCookie(token: string, secure: boolean, maxAge = APP_SESSION_TTL_SECONDS): string {
  return `${APP_SESSION_COOKIE}=${token}; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearSessionCookie(secure: boolean): string {
  return `${APP_SESSION_COOKIE}=; Path=/; HttpOnly; ${secure ? "Secure; " : ""}SameSite=Lax; Max-Age=0`;
}
