import {
  APP_ROLES,
  AppAuthError,
  canChangeRoles,
  changeUserRole,
  requireAuthenticatedUser,
  type AppRole,
} from "@/server/auth";
import { authErrorResponse } from "@/server/auth/http";

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireAuthenticatedUser(request);
    if (!canChangeRoles(actor.role)) {
      throw new AppAuthError("ACCESS_DENIED", 403, "Только архитектор может менять роли.");
    }
    const payload = await request.json() as Record<string, unknown>;
    const role = typeof payload.role === "string" ? payload.role as AppRole : null;
    if (!role || !APP_ROLES.includes(role)) {
      throw new AppAuthError("INVALID_INPUT", 400, "Укажите допустимую роль.");
    }
    const { userId } = await context.params;
    if (userId === actor.id && role !== "architect") {
      throw new AppAuthError("INVALID_INPUT", 400, "Архитектор не может снять собственную роль.");
    }
    const user = await changeUserRole(userId, role);
    if (!user) return Response.json({ error: "USER_NOT_FOUND" }, { status: 404 });
    return Response.json({ user });
  } catch (error) {
    return authErrorResponse(error);
  }
}
