import type { AppRole } from "./types";

// Faithful port of razbor2's server/auth/policy.ts role hierarchy:
// architect > admin > manager.
export function canViewAllAnalyses(role: AppRole): boolean {
  return role === "architect" || role === "admin";
}

export function canAddManagers(role: AppRole): boolean {
  return role === "architect" || role === "admin";
}

/** Only the architect may create other admins/architects or change roles. */
export function canChangeRoles(role: AppRole): boolean {
  return role === "architect";
}

export function roleAllowedWhenCreatingUser(actorRole: AppRole, targetRole: AppRole): boolean {
  if (actorRole === "architect") return true;
  if (actorRole === "admin") return targetRole === "manager";
  return false;
}

export function canAccessOwnedAnalysis(
  actorRole: AppRole,
  actorUserId: string,
  ownerUserId: string,
): boolean {
  if (canViewAllAnalyses(actorRole)) return true;
  return actorUserId === ownerUserId;
}
