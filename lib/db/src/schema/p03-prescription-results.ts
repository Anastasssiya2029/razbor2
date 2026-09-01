import { integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { p03StatusEnum, cabinetSchema } from "./enums";
import { analysisRunsTable } from "./analysis-runs";
import { moneyNowSelectionsTable } from "./money-now-selections";

// P-03 (AI, conditional): only runs when Money Now selected a scenario.
// When selectionStatus is "no_eligible_scenario" this row is written with
// status "skipped_no_scenario" and no prompt/AI fields populated.
export const p03PrescriptionResultsTable = cabinetSchema.table("p03_prescription_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisRunId: uuid("analysis_run_id")
    .notNull()
    .unique()
    .references(() => analysisRunsTable.id, { onDelete: "cascade" }),
  moneyNowSelectionId: uuid("money_now_selection_id")
    .notNull()
    .references(() => moneyNowSelectionsTable.id),
  status: p03StatusEnum("status").notNull(),
  promptVersion: text("prompt_version"),
  outputSchemaVersion: text("output_schema_version"),
  inputHash: text("input_hash"),
  resultHash: text("result_hash"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  providerRawResponse: jsonb("provider_raw_response").$type<Record<string, unknown>>(),
  providerModel: text("provider_model"),
  tokenUsage: jsonb("token_usage").$type<Record<string, unknown>>(),
  retryCount: integer("retry_count").notNull().default(0),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertP03PrescriptionResultSchema = createInsertSchema(
  p03PrescriptionResultsTable,
).omit({ id: true, createdAt: true });
export type InsertP03PrescriptionResult = z.infer<typeof insertP03PrescriptionResultSchema>;
export type P03PrescriptionResult = typeof p03PrescriptionResultsTable.$inferSelect;
