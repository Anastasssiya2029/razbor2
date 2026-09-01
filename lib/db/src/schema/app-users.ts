import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appRoleEnum, appUserStatusEnum, cabinetSchema } from "./enums";

// No open signup: every row is created by an architect/admin invite (status
// "invited", passwordHash null) and only becomes "active" once the invited
// person accepts and sets a password. See app-invites.ts for the token flow.
export const appUsersTable = cabinetSchema.table("app_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  role: appRoleEnum("role").notNull(),
  status: appUserStatusEnum("status").notNull().default("invited"),
  passwordHash: text("password_hash"),
  createdByUserId: uuid("created_by_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertAppUserSchema = createInsertSchema(appUsersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type AppUser = typeof appUsersTable.$inferSelect;
