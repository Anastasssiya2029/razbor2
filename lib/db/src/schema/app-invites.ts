import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appInviteStatusEnum, cabinetSchema } from "./enums";
import { appUsersTable } from "./app-users";

// The invite token itself is never stored -- only its SHA-256 hash, the same
// pattern used for session tokens (see app-sessions.ts).
export const appInvitesTable = cabinetSchema.table("app_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUsersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  status: appInviteStatusEnum("status").notNull().default("pending"),
  invitedByUserId: uuid("invited_by_user_id")
    .notNull()
    .references(() => appUsersTable.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAppInviteSchema = createInsertSchema(appInvitesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAppInvite = z.infer<typeof insertAppInviteSchema>;
export type AppInvite = typeof appInvitesTable.$inferSelect;
