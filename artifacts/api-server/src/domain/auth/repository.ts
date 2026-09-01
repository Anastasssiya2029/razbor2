import { db } from "@workspace/db";
import {
  appInvitesTable,
  appSessionsTable,
  appUsersTable,
  type AppUser,
} from "@workspace/db";
import { and, eq, gt } from "drizzle-orm";
import { APP_SESSION_TTL_SECONDS, hashSessionToken } from "./session";
import type { AppRole, AuthenticatedAppUser, PublicAppUser } from "./types";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toPublicUser(row: AppUser): PublicAppUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
  };
}

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const rows = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.email, normalizeEmail(email)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const rows = await db.select().from(appUsersTable).where(eq(appUsersTable.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function listAppUsers(): Promise<PublicAppUser[]> {
  const rows = await db.select().from(appUsersTable).orderBy(appUsersTable.displayName);
  return rows.map(toPublicUser);
}

export async function createInvitedUser(input: {
  email: string;
  displayName: string;
  role: AppRole;
  createdByUserId: string;
}): Promise<AppUser> {
  const [row] = await db
    .insert(appUsersTable)
    .values({
      email: normalizeEmail(input.email),
      displayName: input.displayName.trim(),
      role: input.role,
      status: "invited",
      createdByUserId: input.createdByUserId,
    })
    .returning();
  if (!row) throw new Error("Failed to create invited user");
  return row;
}

export async function createInviteToken(input: {
  userId: string;
  tokenHash: string;
  invitedByUserId: string;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(appInvitesTable).values({
    userId: input.userId,
    tokenHash: input.tokenHash,
    invitedByUserId: input.invitedByUserId,
    expiresAt: input.expiresAt,
    status: "pending",
  });
}

export async function findPendingInviteByTokenHash(tokenHash: string) {
  const rows = await db
    .select({ invite: appInvitesTable, user: appUsersTable })
    .from(appInvitesTable)
    .innerJoin(appUsersTable, eq(appInvitesTable.userId, appUsersTable.id))
    .where(
      and(
        eq(appInvitesTable.tokenHash, tokenHash),
        eq(appInvitesTable.status, "pending"),
        gt(appInvitesTable.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export class InviteAlreadyUsedError extends Error {
  constructor() {
    super("Invite has already been accepted or is no longer pending.");
    this.name = "InviteAlreadyUsedError";
  }
}

/**
 * Atomically consumes a pending invite and activates its user. The invite
 * update is conditioned on `status = 'pending'` and its affected-row count
 * is checked, so two concurrent accept requests for the same invite token
 * cannot both succeed -- only the first to flip the row wins the race.
 */
export async function acceptInvite(input: {
  inviteId: string;
  userId: string;
  passwordHash: string;
}): Promise<AppUser> {
  return db.transaction(async (tx) => {
    const acceptedInvites = await tx
      .update(appInvitesTable)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(and(eq(appInvitesTable.id, input.inviteId), eq(appInvitesTable.status, "pending")))
      .returning({ id: appInvitesTable.id });
    if (acceptedInvites.length === 0) throw new InviteAlreadyUsedError();

    const [user] = await tx
      .update(appUsersTable)
      .set({ passwordHash: input.passwordHash, status: "active" })
      .where(eq(appUsersTable.id, input.userId))
      .returning();
    if (!user) throw new Error("Failed to activate invited user");
    return user;
  });
}

export async function createAppSession(input: { userId: string }): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const { createSessionToken } = await import("./session");
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + APP_SESSION_TTL_SECONDS * 1000);
  await db.insert(appSessionsTable).values({ userId: input.userId, tokenHash, expiresAt });
  return { token, expiresAt };
}

export async function findUserBySessionToken(token: string): Promise<AuthenticatedAppUser | null> {
  const tokenHash = hashSessionToken(token);
  const rows = await db
    .select({ session: appSessionsTable, user: appUsersTable })
    .from(appSessionsTable)
    .innerJoin(appUsersTable, eq(appSessionsTable.userId, appUsersTable.id))
    .where(and(eq(appSessionsTable.tokenHash, tokenHash), gt(appSessionsTable.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || row.user.status !== "active") return null;
  return { ...toPublicUser(row.user), sessionId: row.session.id };
}

export async function revokeSessionByToken(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token);
  await db.delete(appSessionsTable).where(eq(appSessionsTable.tokenHash, tokenHash));
}

export async function changeUserRole(userId: string, role: AppRole): Promise<PublicAppUser | null> {
  const [row] = await db.update(appUsersTable).set({ role }).where(eq(appUsersTable.id, userId)).returning();
  return row ? toPublicUser(row) : null;
}
