import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./password";
import { db, appUsersTable } from "@workspace/db";
import {
  acceptInvite,
  changeUserRole,
  createAppSession,
  createInvitedUser,
  createInviteToken,
  findPendingInviteByTokenHash,
  findUserByEmail,
  InviteAlreadyUsedError,
  listAppUsers,
  normalizeEmail,
  revokeSessionByToken,
} from "./repository";
import { canAddManagers, canChangeRoles, roleAllowedWhenCreatingUser } from "./policy";
import { hashSessionToken } from "./session";
import type { AppRole, AuthenticatedAppUser, PublicAppUser } from "./types";

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

const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days to accept an invite

function toPublic(user: PublicAppUser): PublicAppUser {
  return user;
}

export async function loginWithPassword(email: string, password: string): Promise<{
  user: PublicAppUser;
  token: string;
  expiresAt: Date;
}> {
  const normalized = normalizeEmail(email);
  const user = await findUserByEmail(normalized);
  if (!user || user.status !== "active" || !user.passwordHash) {
    throw new AppAuthError("ACCESS_DENIED", 403, "Неверный email или пароль.");
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new AppAuthError("ACCESS_DENIED", 403, "Неверный email или пароль.");
  const session = await createAppSession({ userId: user.id });
  return {
    user: toPublic({ id: user.id, email: user.email, displayName: user.displayName, role: user.role, status: user.status }),
    token: session.token,
    expiresAt: session.expiresAt,
  };
}

export async function createInvite(input: {
  actorRole: AppRole;
  actorUserId: string;
  email: string;
  displayName: string;
  role: AppRole;
}): Promise<{ token: string; expiresAt: Date; userId: string }> {
  if (!canAddManagers(input.actorRole)) {
    throw new AppAuthError("ACCESS_DENIED", 403, "Недостаточно прав для приглашения пользователей.");
  }
  if (!roleAllowedWhenCreatingUser(input.actorRole, input.role)) {
    throw new AppAuthError("ACCESS_DENIED", 403, "Недостаточно прав для назначения этой роли.");
  }
  const existing = await findUserByEmail(input.email);
  if (existing) throw new AppAuthError("INVALID_INPUT", 400, "Пользователь с этим email уже существует.");

  const user = await createInvitedUser({
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    createdByUserId: input.actorUserId,
  });
  const token = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  await createInviteToken({
    userId: user.id,
    tokenHash: hashSessionToken(token),
    invitedByUserId: input.actorUserId,
    expiresAt,
  });
  return { token, expiresAt, userId: user.id };
}

export async function acceptInviteAndSetPassword(input: {
  token: string;
  password: string;
}): Promise<PublicAppUser> {
  if (input.password.length < 6 || input.password.length > 128) {
    throw new AppAuthError("INVALID_INPUT", 400, "Пароль должен содержать от 6 до 128 символов.");
  }
  const tokenHash = hashSessionToken(input.token);
  const found = await findPendingInviteByTokenHash(tokenHash);
  if (!found) throw new AppAuthError("ACCESS_DENIED", 403, "Приглашение недействительно или устарело.");
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await acceptInvite({ inviteId: found.invite.id, userId: found.user.id, passwordHash });
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role, status: user.status };
  } catch (error) {
    if (error instanceof InviteAlreadyUsedError) {
      throw new AppAuthError("ACCESS_DENIED", 403, "Приглашение недействительно или устарело.");
    }
    throw error;
  }
}

export async function getInvitePreview(token: string): Promise<{ email: string; displayName: string; role: AppRole } | null> {
  const found = await findPendingInviteByTokenHash(hashSessionToken(token));
  if (!found) return null;
  return { email: found.user.email, displayName: found.user.displayName, role: found.user.role };
}

export async function changeRole(input: { actorRole: AppRole; userId: string; role: AppRole }): Promise<PublicAppUser> {
  if (!canChangeRoles(input.actorRole)) {
    throw new AppAuthError("ACCESS_DENIED", 403, "Только архитектор может менять роли.");
  }
  const user = await changeUserRole(input.userId, input.role);
  if (!user) throw new AppAuthError("INVALID_INPUT", 400, "Пользователь не найден.");
  return user;
}

/**
 * Creates the very first architect account. Only works while no app_users
 * row exists at all -- there is no external identity provider to seed
 * accounts from (unlike the Supabase-backed reference), so this one-time
 * bootstrap is the sole way to obtain the first admin/architect user.
 */
// Arbitrary fixed key for the Postgres session-level advisory lock used to
// serialize first-architect bootstrap attempts (see below).
const BOOTSTRAP_ADVISORY_LOCK_KEY = 875_930_441;

export async function bootstrapFirstArchitect(input: {
  email: string;
  displayName: string;
  password: string;
}): Promise<PublicAppUser> {
  if (input.password.length < 6 || input.password.length > 128) {
    throw new AppAuthError("INVALID_INPUT", 400, "Пароль должен содержать от 6 до 128 символов.");
  }
  // Hash the password before taking the lock so the (comparatively slow)
  // scrypt call doesn't hold the transaction/lock open longer than needed.
  const passwordHash = await hashPassword(input.password);

  // Two concurrent unauthenticated requests could otherwise both observe an
  // empty app_users table and each insert an architect. `pg_advisory_xact_lock`
  // serializes all bootstrap attempts on the same DB session key, and the
  // existing-user check is re-run *inside* the lock, so only the first
  // request to acquire it can ever create a user.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_ADVISORY_LOCK_KEY})`);
    const existingUsers = await tx.select({ id: appUsersTable.id }).from(appUsersTable).limit(1);
    if (existingUsers.length > 0) {
      throw new AppAuthError("ACCESS_DENIED", 403, "Первый архитектор уже создан. Используйте приглашения.");
    }
    const [user] = await tx
      .insert(appUsersTable)
      .values({
        email: normalizeEmail(input.email),
        displayName: input.displayName.trim(),
        role: "architect",
        status: "active",
        passwordHash,
      })
      .returning();
    if (!user) throw new Error("Failed to bootstrap first architect");
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role, status: user.status };
  });
}

export async function logout(token: string): Promise<void> {
  await revokeSessionByToken(token);
}

export async function listUsers(): Promise<PublicAppUser[]> {
  return listAppUsers();
}

export type { AuthenticatedAppUser };
