import {
  activateAuthorizedIdentity,
  createAppSession,
  findInvitedUserByEmail,
  findUserBySessionHash,
  normalizeEmail,
  revokeSessionByHash,
} from "./repository";
import {
  APP_SESSION_TTL_SECONDS,
  createSessionToken,
  hashSessionToken,
  readSessionToken,
} from "./session";
import {
  loadSupabaseAuthEnvironment,
  signInWithPassword,
  signUpWithPassword,
  updatePasswordWithRecoveryToken,
} from "./supabase";
import type { AuthenticatedAppUser } from "./types";

export class AppAuthError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "ACCESS_DENIED" | "UNAUTHENTICATED",
    readonly status: 400 | 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "AppAuthError";
  }
}

function validateCredentials(payload: unknown): { email: string; password: string } {
  if (!payload || typeof payload !== "object") {
    throw new AppAuthError("INVALID_INPUT", 400, "Введите email и пароль.");
  }
  const record = payload as Record<string, unknown>;
  const email = typeof record.email === "string" ? normalizeEmail(record.email) : "";
  const password = typeof record.password === "string" ? record.password : "";
  if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/u.test(email)) {
    throw new AppAuthError("INVALID_INPUT", 400, "Введите корректный email.");
  }
  if (password.length < 6 || password.length > 128) {
    throw new AppAuthError("INVALID_INPUT", 400, "Пароль должен содержать от 6 до 128 символов.");
  }
  return { email, password };
}

function validatePasswordReset(payload: unknown): { accessToken: string; password: string } {
  if (!payload || typeof payload !== "object") {
    throw new AppAuthError("INVALID_INPUT", 400, "Введите новый пароль.");
  }
  const record = payload as Record<string, unknown>;
  const accessToken = typeof record.accessToken === "string" ? record.accessToken.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";
  if (accessToken.length < 32 || accessToken.length > 8192) {
    throw new AppAuthError("INVALID_INPUT", 400, "Ссылка восстановления недействительна или устарела.");
  }
  if (password.length < 6 || password.length > 128) {
    throw new AppAuthError("INVALID_INPUT", 400, "Пароль должен содержать от 6 до 128 символов.");
  }
  return { accessToken, password };
}

async function issueSession(userId: string): Promise<{ token: string; expiresAt: number }> {
  const token = createSessionToken();
  const tokenHash = await hashSessionToken(token);
  const expiresAt = Math.floor(Date.now() / 1000) + APP_SESSION_TTL_SECONDS;
  await createAppSession({ userId, tokenHash, expiresAt });
  return { token, expiresAt };
}

export async function loginWithPassword(payload: unknown) {
  const credentials = validateCredentials(payload);
  const identity = await signInWithPassword(await loadSupabaseAuthEnvironment(), credentials);
  const user = await activateAuthorizedIdentity(identity);
  if (!user) throw new AppAuthError("ACCESS_DENIED", 403, "Для этого аккаунта нет доступа к сервису.");
  return { user, ...(await issueSession(user.id)) };
}

export async function registerInvitedAccount(payload: unknown): Promise<{ confirmationRequired: true }> {
  const credentials = validateCredentials(payload);
  const invited = await findInvitedUserByEmail(credentials.email);
  if (!invited) throw new AppAuthError("ACCESS_DENIED", 403, "Для этого email нет приглашения.");
  await signUpWithPassword(await loadSupabaseAuthEnvironment(), credentials);
  return { confirmationRequired: true };
}

export async function resetPassword(payload: unknown): Promise<void> {
  const reset = validatePasswordReset(payload);
  await updatePasswordWithRecoveryToken(
    await loadSupabaseAuthEnvironment(),
    reset.accessToken,
    reset.password,
  );
}

export async function getAuthenticatedUser(request: Request): Promise<AuthenticatedAppUser | null> {
  const token = readSessionToken(request);
  if (!token) return null;
  return findUserBySessionHash(await hashSessionToken(token));
}

export async function requireAuthenticatedUser(request: Request): Promise<AuthenticatedAppUser> {
  const user = await getAuthenticatedUser(request);
  if (!user) throw new AppAuthError("UNAUTHENTICATED", 401, "Требуется вход.");
  return user;
}

export async function logoutRequest(request: Request): Promise<void> {
  const token = readSessionToken(request);
  if (token) await revokeSessionByHash(await hashSessionToken(token));
}
