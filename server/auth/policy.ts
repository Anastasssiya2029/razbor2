import type { AppRole } from "./types";

export function canViewAllAnalyses(role: AppRole): boolean {
  return role === "architect" || role === "admin";
}

export function canAddManagers(role: AppRole): boolean {
  return role === "architect" || role === "admin";
}

export function canChangeRoles(role: AppRole): boolean {
  return role === "architect";
}

export function roleAllowedWhenCreatingUser(actorRole: AppRole, requestedRole: AppRole): boolean {
  if (actorRole === "architect") return true;
  return actorRole === "admin" && requestedRole === "manager";
}

export function canAccessOwnedAnalysis(role: AppRole, actorUserId: string, ownerUserId: string | null): boolean {
  if (canViewAllAnalyses(role)) return true;
  return Boolean(ownerUserId) && actorUserId === ownerUserId;
}
