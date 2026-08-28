import { getDb } from "@/db";
import { appSessions, appUsers } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { INITIAL_ACCESS_USERS } from "./initial-access";
import type { AppRole, AppUser, AppUserStatus, InitialAccessUser } from "./types";

export function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase("en-US");
}

function toAppUser(row: typeof appUsers.$inferSelect): AppUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role as AppRole,
    status: row.status as AppUserStatus,
  };
}

export async function ensureInitialAccessRegistry(
  initialUsers: readonly InitialAccessUser[] = INITIAL_ACCESS_USERS,
): Promise<void> {
  const db = await getDb();
  for (const user of initialUsers) {
    await db.insert(appUsers).values({
        id: crypto.randomUUID(),
        email: normalizeEmail(user.email),
        displayName: user.displayName.trim(),
        role: user.role,
        status: "invited",
      }).onConflictDoNothing({ target: appUsers.email });
  }
}

export async function activateAuthorizedIdentity(identity: {
  subject: string;
  email: string;
}): Promise<AppUser | null> {
  await ensureInitialAccessRegistry();
  const db = await getDb();
  const email = normalizeEmail(identity.email);
  const rows = await db.select().from(appUsers).where(eq(appUsers.email, email)).limit(1);
  const user = rows[0];
  if (!user || user.status === "disabled") return null;
  if (user.authSubject && user.authSubject !== identity.subject) return null;

  if (!user.authSubject || user.status !== "active") {
    await db.update(appUsers).set({
      authSubject: identity.subject,
      status: "active",
      updatedAt: new Date().toISOString(),
    }).where(eq(appUsers.id, user.id));
  }
  return toAppUser({ ...user, authSubject: identity.subject, status: "active" });
}

export async function findInvitedUserByEmail(email: string): Promise<AppUser | null> {
  await ensureInitialAccessRegistry();
  const db = await getDb();
  const rows = await db.select().from(appUsers).where(eq(appUsers.email, normalizeEmail(email))).limit(1);
  const user = rows[0];
  if (!user || user.status === "disabled") return null;
  return toAppUser(user);
}

export async function createAppSession(input: {
  userId: string;
  tokenHash: string;
  expiresAt: number;
}): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  await db.insert(appSessions).values({
    id,
    userId: input.userId,
    tokenHash: input.tokenHash,
    expiresAt: input.expiresAt,
    lastSeenAt: now,
  });
  return id;
}

export async function findUserBySessionHash(tokenHash: string): Promise<(AppUser & { sessionId: string }) | null> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  const rows = await db
    .select({ session: appSessions, user: appUsers })
    .from(appSessions)
    .innerJoin(appUsers, eq(appSessions.userId, appUsers.id))
    .where(and(
      eq(appSessions.tokenHash, tokenHash),
      gt(appSessions.expiresAt, now),
      isNull(appSessions.revokedAt),
      eq(appUsers.status, "active"),
    ))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  await db.update(appSessions).set({ lastSeenAt: now }).where(eq(appSessions.id, row.session.id));
  return { ...toAppUser(row.user), sessionId: row.session.id };
}

export async function revokeSessionByHash(tokenHash: string): Promise<void> {
  const db = await getDb();
  await db.update(appSessions).set({ revokedAt: new Date().toISOString() }).where(eq(appSessions.tokenHash, tokenHash));
}

export async function listAppUsers(): Promise<AppUser[]> {
  await ensureInitialAccessRegistry();
  const db = await getDb();
  const rows = await db.select().from(appUsers).orderBy(appUsers.displayName);
  return rows.map(toAppUser);
}

export async function createInvitedUser(input: {
  email: string;
  displayName: string;
  role: AppRole;
  createdByUserId: string;
}): Promise<AppUser> {
  const db = await getDb();
  const row = {
    id: crypto.randomUUID(),
    email: normalizeEmail(input.email),
    displayName: input.displayName.trim(),
    role: input.role,
    status: "invited" as const,
    createdByUserId: input.createdByUserId,
  };
  await db.insert(appUsers).values(row);
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
  };
}

export async function changeUserRole(userId: string, role: AppRole): Promise<AppUser | null> {
  const db = await getDb();
  await db.update(appUsers).set({ role, updatedAt: new Date().toISOString() }).where(eq(appUsers.id, userId));
  const rows = await db.select().from(appUsers).where(eq(appUsers.id, userId)).limit(1);
  return rows[0] ? toAppUser(rows[0]) : null;
}
