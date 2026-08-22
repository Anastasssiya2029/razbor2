import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_ACCESS_USERS } from "../server/auth/initial-access";
import {
  canAddManagers,
  canAccessOwnedAnalysis,
  canChangeRoles,
  canViewAllAnalyses,
  roleAllowedWhenCreatingUser,
} from "../server/auth/policy";
import {
  APP_SESSION_COOKIE,
  createSessionToken,
  hashSessionToken,
  readSessionToken,
  sessionCookie,
} from "../server/auth/session";
import { SupabaseAuthError, signInWithPassword, updatePasswordWithRecoveryToken } from "../server/auth/supabase";

test("initial access registry has one architect, two admins and two managers", () => {
  assert.deepEqual(
    INITIAL_ACCESS_USERS.map((user) => user.role),
    ["architect", "admin", "admin", "manager", "manager"],
  );
  assert.equal(new Set(INITIAL_ACCESS_USERS.map((user) => user.email)).size, 5);
});

test("role policy separates manager creation from role changes", () => {
  assert.equal(canViewAllAnalyses("architect"), true);
  assert.equal(canViewAllAnalyses("admin"), true);
  assert.equal(canViewAllAnalyses("manager"), false);
  assert.equal(canAddManagers("admin"), true);
  assert.equal(canAddManagers("manager"), false);
  assert.equal(canChangeRoles("architect"), true);
  assert.equal(canChangeRoles("admin"), false);
  assert.equal(roleAllowedWhenCreatingUser("admin", "manager"), true);
  assert.equal(roleAllowedWhenCreatingUser("admin", "admin"), false);
  assert.equal(roleAllowedWhenCreatingUser("architect", "admin"), true);
  assert.equal(canAccessOwnedAnalysis("manager", "manager-a", "manager-a"), true);
  assert.equal(canAccessOwnedAnalysis("manager", "manager-a", "manager-b"), false);
  assert.equal(canAccessOwnedAnalysis("admin", "admin-a", "manager-b"), true);
  assert.equal(canAccessOwnedAnalysis("architect", "architect-a", null), true);
});

test("session tokens are random, hashed and read only from the named cookie", async () => {
  const first = createSessionToken();
  const second = createSessionToken();
  assert.notEqual(first, second);
  assert.equal(first.length >= 40, true);
  const hash = await hashSessionToken(first);
  assert.match(hash, /^[a-f0-9]{64}$/u);
  assert.equal(hash.includes(first), false);

  const cookie = sessionCookie(first, 60, false);
  assert.match(cookie, new RegExp(`^${APP_SESSION_COOKIE}=`));
  assert.match(cookie, /HttpOnly/u);
  assert.match(cookie, /SameSite=Lax/u);
  assert.doesNotMatch(cookie, /Secure/u);
  const request = new Request("http://localhost", { headers: { cookie: `other=x; ${cookie}` } });
  assert.equal(readSessionToken(request), first);
});

test("Supabase password login sends credentials only to configured HTTPS provider", async () => {
  let seenUrl = "";
  let seenBody = "";
  const identity = await signInWithPassword(
    { SUPABASE_URL: "https://identity.example", SUPABASE_ANON_KEY: "public-anon" },
    { email: "manager@example.com", password: "temporary-password" },
    async (input, init) => {
      seenUrl = String(input);
      seenBody = String(init?.body);
      return Response.json({ user: { id: "auth-subject", email: "MANAGER@example.com" } });
    },
  );
  assert.equal(seenUrl, "https://identity.example/auth/v1/token?grant_type=password");
  assert.deepEqual(JSON.parse(seenBody), { email: "manager@example.com", password: "temporary-password" });
  assert.deepEqual(identity, { subject: "auth-subject", email: "manager@example.com" });
});

test("Supabase provider errors are fail-closed and do not expose upstream text", async () => {
  await assert.rejects(
    signInWithPassword(
      { SUPABASE_URL: "https://identity.example", SUPABASE_ANON_KEY: "public-anon" },
      { email: "manager@example.com", password: "wrong-password" },
      async () => new Response("provider-secret-detail", { status: 400 }),
    ),
    (error: unknown) => {
      assert.equal(error instanceof SupabaseAuthError, true);
      assert.equal((error as SupabaseAuthError).code, "INVALID_CREDENTIALS");
      assert.equal((error as Error).message.includes("provider-secret-detail"), false);
      return true;
    },
  );
});

test("Supabase password recovery updates only the password for the bearer recovery session", async () => {
  let seenUrl = "";
  let seenMethod = "";
  let seenAuthorization = "";
  let seenBody = "";
  await updatePasswordWithRecoveryToken(
    { SUPABASE_URL: "https://identity.example", SUPABASE_ANON_KEY: "public-anon" },
    "recovery-access-token",
    "new-private-password",
    async (input, init) => {
      seenUrl = String(input);
      seenMethod = String(init?.method);
      seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";
      seenBody = String(init?.body);
      return Response.json({ id: "auth-subject" });
    },
  );
  assert.equal(seenUrl, "https://identity.example/auth/v1/user");
  assert.equal(seenMethod, "PUT");
  assert.equal(seenAuthorization, "Bearer recovery-access-token");
  assert.deepEqual(JSON.parse(seenBody), { password: "new-private-password" });
});

test("Supabase password recovery errors do not expose upstream text", async () => {
  await assert.rejects(
    updatePasswordWithRecoveryToken(
      { SUPABASE_URL: "https://identity.example", SUPABASE_ANON_KEY: "public-anon" },
      "expired-recovery-access-token",
      "new-private-password",
      async () => new Response("provider-secret-detail", { status: 401 }),
    ),
    (error: unknown) => {
      assert.equal(error instanceof SupabaseAuthError, true);
      assert.equal((error as SupabaseAuthError).code, "INVALID_RECOVERY_TOKEN");
      assert.equal((error as Error).message.includes("provider-secret-detail"), false);
      return true;
    },
  );
});
