import type { InitialAccessUser } from "./types";

/**
 * Initial private access registry. It contains no passwords or provider tokens.
 * Passwords remain exclusively with the external identity provider.
 */
export const INITIAL_ACCESS_USERS: readonly InitialAccessUser[] = [
  { email: "sochneva.anastasiya@gmail.com", displayName: "Анастасия", role: "architect" },
  { email: "alimova8181@gmail.com", displayName: "Галина Алимова", role: "admin" },
  { email: "erofeeva-94@list.ru", displayName: "Алёна Ерофеева", role: "admin" },
  { email: "lastochka.w@mail.ru", displayName: "Таня Ласточка", role: "manager" },
  { email: "detskiyclub@internet.ru", displayName: "Виктория Точеных", role: "manager" },
] as const;
