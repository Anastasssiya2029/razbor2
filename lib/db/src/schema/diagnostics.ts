import { jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cabinetSchema } from "./enums";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { appUsersTable } from "./app-users";
import { clientsTable } from "./clients";

// One completed DiagnosticInput v1.2 questionnaire for one client. Stores both
// the raw manager-entered answers (for audit/export) and the normalized,
// schema-validated structure the pipeline actually consumes.
export const diagnosticsTable = cabinetSchema.table("diagnostics", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clientsTable.id),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => appUsersTable.id),
  inputSchemaVersion: text("input_schema_version").notNull().default("diagnostic-input.v1"),
  rawAnswers: jsonb("raw_answers").$type<Record<string, unknown>>().notNull(),
  normalizedInput: jsonb("normalized_input").$type<Record<string, unknown>>().notNull(),
  normalizedInputHash: text("normalized_input_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertDiagnosticSchema = createInsertSchema(diagnosticsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDiagnostic = z.infer<typeof insertDiagnosticSchema>;
export type Diagnostic = typeof diagnosticsTable.$inferSelect;
