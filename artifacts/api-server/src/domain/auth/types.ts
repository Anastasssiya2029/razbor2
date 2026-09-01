// Mirrors the reference architecture's role hierarchy and account lifecycle,
// adapted for locally-owned password auth instead of an external identity provider.
export const APP_ROLES = ["architect", "admin", "manager"] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const APP_USER_STATUSES = ["invited", "active", "disabled"] as const;
export type AppUserStatus = (typeof APP_USER_STATUSES)[number];

export type PublicAppUser = {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
  status: AppUserStatus;
};

export type AuthenticatedAppUser = PublicAppUser & {
  sessionId: string;
};
