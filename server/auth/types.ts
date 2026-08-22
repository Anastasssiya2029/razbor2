export const APP_ROLES = ["architect", "admin", "manager"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const APP_USER_STATUSES = ["invited", "active", "disabled"] as const;
export type AppUserStatus = (typeof APP_USER_STATUSES)[number];

export type AppUser = {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
  status: AppUserStatus;
};

export type AuthenticatedAppUser = AppUser & {
  sessionId: string;
};

export type InitialAccessUser = Pick<AppUser, "email" | "displayName" | "role">;
