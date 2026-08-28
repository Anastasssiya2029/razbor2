export type SupabaseAuthEnvironment = Record<string, string | undefined>;
type FetchLike = typeof fetch;

export class SupabaseAuthError extends Error {
  constructor(
    readonly code: "AUTH_NOT_CONFIGURED" | "INVALID_CREDENTIALS" | "SIGNUP_FAILED" | "INVALID_RECOVERY_TOKEN" | "PROVIDER_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "SupabaseAuthError";
  }
}

export type SupabaseIdentity = {
  subject: string;
  email: string;
};

function providerConfig(environment: SupabaseAuthEnvironment): { baseUrl: string; anonKey: string } {
  const rawUrl = environment.SUPABASE_URL?.trim();
  const anonKey = environment.SUPABASE_ANON_KEY?.trim();
  if (!rawUrl || !anonKey) {
    throw new SupabaseAuthError("AUTH_NOT_CONFIGURED", "Вход пока не настроен.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SupabaseAuthError("AUTH_NOT_CONFIGURED", "Вход пока не настроен.");
  }
  if (url.protocol !== "https:") {
    throw new SupabaseAuthError("AUTH_NOT_CONFIGURED", "Вход пока не настроен.");
  }
  return { baseUrl: url.origin, anonKey };
}

function normalizeProviderIdentity(payload: unknown): SupabaseIdentity | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const user = record.user && typeof record.user === "object"
    ? record.user as Record<string, unknown>
    : record;
  const subject = typeof user.id === "string" ? user.id.trim() : "";
  const email = typeof user.email === "string" ? user.email.trim().toLocaleLowerCase("en-US") : "";
  return subject && email ? { subject, email } : null;
}

async function providerRequest(
  environment: SupabaseAuthEnvironment,
  path: string,
  body: Record<string, unknown>,
  errorCode: "INVALID_CREDENTIALS" | "SIGNUP_FAILED",
  fetchImpl: FetchLike,
): Promise<SupabaseIdentity> {
  const config = providerConfig(environment);
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}${path}`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new SupabaseAuthError("PROVIDER_UNAVAILABLE", "Сервис входа временно недоступен.");
  }

  if (!response.ok) {
    throw new SupabaseAuthError(
      response.status >= 500 ? "PROVIDER_UNAVAILABLE" : errorCode,
      errorCode === "INVALID_CREDENTIALS" ? "Неверный email или пароль." : "Не удалось создать учётную запись.",
    );
  }
  const identity = normalizeProviderIdentity(await response.json());
  if (!identity) {
    throw new SupabaseAuthError("PROVIDER_UNAVAILABLE", "Сервис входа вернул некорректный ответ.");
  }
  return identity;
}

export function signInWithPassword(
  environment: SupabaseAuthEnvironment,
  credentials: { email: string; password: string },
  fetchImpl: FetchLike = fetch,
): Promise<SupabaseIdentity> {
  return providerRequest(
    environment,
    "/auth/v1/token?grant_type=password",
    credentials,
    "INVALID_CREDENTIALS",
    fetchImpl,
  );
}

export function signUpWithPassword(
  environment: SupabaseAuthEnvironment,
  credentials: { email: string; password: string },
  fetchImpl: FetchLike = fetch,
): Promise<SupabaseIdentity> {
  return providerRequest(environment, "/auth/v1/signup", credentials, "SIGNUP_FAILED", fetchImpl);
}

export async function updatePasswordWithRecoveryToken(
  environment: SupabaseAuthEnvironment,
  accessToken: string,
  password: string,
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  const config = providerConfig(environment);
  let response: Response;
  try {
    response = await fetchImpl(`${config.baseUrl}/auth/v1/user`, {
      method: "PUT",
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
  } catch {
    throw new SupabaseAuthError("PROVIDER_UNAVAILABLE", "Сервис входа временно недоступен.");
  }

  if (!response.ok) {
    throw new SupabaseAuthError(
      response.status >= 500 ? "PROVIDER_UNAVAILABLE" : "INVALID_RECOVERY_TOKEN",
      response.status >= 500
        ? "Сервис входа временно недоступен."
        : "Ссылка восстановления недействительна или устарела.",
    );
  }
}

export async function loadSupabaseAuthEnvironment(): Promise<SupabaseAuthEnvironment> {
  const { env } = await import("cloudflare:workers");
  return env as unknown as SupabaseAuthEnvironment;
}
