import { text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cabinetSchema } from "./enums";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appUsersTable } from "./app-users";

// Sessions are opaque random tokens; only the SHA-256 hash is persisted.
// TTL is 7 days (see APP_SESSION_TTL_SECONDS in the auth domain module).
export const appSessionsTable = cabinetSchema.table("app_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUsersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAppSessionSchema = createInsertSchema(appSessionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAppSession = z.infer<typeof insertAppSessionSchema>;
export type AppSession = typeof appSessionsTable.$inferSelect;
