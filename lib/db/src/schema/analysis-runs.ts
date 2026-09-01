import { jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { analysisRunStatusEnum, cabinetSchema } from "./enums";
import { appUsersTable } from "./app-users";
import { diagnosticsTable } from "./diagnostics";

// One pipeline execution for a diagnostic. Status only moves forward through
// the stage enum; each stage's own immutable result table is the source of
// truth, this row just tracks "where are we" + the last error for resumption.
export const analysisRunsTable = cabinetSchema.table("analysis_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  diagnosticId: uuid("diagnostic_id")
    .notNull()
    .references(() => diagnosticsTable.id),
  ownerUserId: uuid("owner_user_id")
    .notNull()
    .references(() => appUsersTable.id),
  status: analysisRunStatusEnum("status").notNull().default("draft"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertAnalysisRunSchema = createInsertSchema(analysisRunsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAnalysisRun = z.infer<typeof insertAnalysisRunSchema>;
export type AnalysisRun = typeof analysisRunsTable.$inferSelect;

// Prevents two concurrent requests from advancing the same run's next stage
// twice (e.g. a manager double-clicking "continue" or a retried request).
export const analysisRunLocksTable = cabinetSchema.table("analysis_run_locks", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisRunId: uuid("analysis_run_id")
    .notNull()
    .unique()
    .references(() => analysisRunsTable.id, { onDelete: "cascade" }),
  lockedStage: text("locked_stage").notNull(),
  lockToken: text("lock_token").notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const insertAnalysisRunLockSchema = createInsertSchema(analysisRunLocksTable).omit({
  id: true,
  lockedAt: true,
});
export type InsertAnalysisRunLock = z.infer<typeof insertAnalysisRunLockSchema>;
export type AnalysisRunLock = typeof analysisRunLocksTable.$inferSelect;
