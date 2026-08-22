import {
  APP_ROLES,
  AppAuthError,
  canAddManagers,
  createInvitedUser,
  listAppUsers,
  requireAuthenticatedUser,
  roleAllowedWhenCreatingUser,
  type AppRole,
} from "@/server/auth";
import { authErrorResponse } from "@/server/auth/http";

export async function GET(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    if (!canAddManagers(actor.role)) {
      throw new AppAuthError("ACCESS_DENIED", 403, "Недостаточно прав.");
    }
    return Response.json({ users: await listAppUsers() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAuthenticatedUser(request);
    if (!canAddManagers(actor.role)) {
      throw new AppAuthError("ACCESS_DENIED", 403, "Недостаточно прав.");
    }
    const payload = await request.json() as Record<string, unknown>;
    const email = typeof payload.email === "string" ? payload.email.trim() : "";
    const displayName = typeof payload.displayName === "string" ? payload.displayName.trim() : "";
    const requestedRole = typeof payload.role === "string" ? payload.role as AppRole : "manager";
    if (!email || email.length > 254 || !/^\S+@\S+\.\S+$/u.test(email) || !displayName || displayName.length > 120 || !APP_ROLES.includes(requestedRole)) {
      throw new AppAuthError("INVALID_INPUT", 400, "Укажите имя, email и допустимую роль.");
    }
    if (!roleAllowedWhenCreatingUser(actor.role, requestedRole)) {
      throw new AppAuthError("ACCESS_DENIED", 403, "Администратор может добавлять только менеджеров.");
    }
    try {
      const user = await createInvitedUser({ email, displayName, role: requestedRole, createdByUserId: actor.id });
      return Response.json({ user }, { status: 201 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/unique|constraint/i.test(message)) {
        return Response.json({ error: "USER_ALREADY_EXISTS", message: "Пользователь с таким email уже существует." }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    return authErrorResponse(error);
  }
}
