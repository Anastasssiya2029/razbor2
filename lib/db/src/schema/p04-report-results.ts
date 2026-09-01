import { integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cabinetSchema } from "./enums";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { analysisRunsTable } from "./analysis-runs";
import { p03PrescriptionResultsTable } from "./p03-prescription-results";

// P-04 (AI): writes the final narrative report sections consumed by the
// analysis-result assembler (summary, per-element commentary, plan framing).
export const p04ReportResultsTable = cabinetSchema.table("p04_report_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisRunId: uuid("analysis_run_id")
    .notNull()
    .unique()
    .references(() => analysisRunsTable.id, { onDelete: "cascade" }),
  p03PrescriptionResultId: uuid("p03_prescription_result_id")
    .notNull()
    .references(() => p03PrescriptionResultsTable.id),
  promptVersion: text("prompt_version").notNull(),
  outputSchemaVersion: text("output_schema_version").notNull(),
  inputHash: text("input_hash").notNull(),
  resultHash: text("result_hash"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  providerRawResponse: jsonb("provider_raw_response").$type<Record<string, unknown>>(),
  providerModel: text("provider_model"),
  tokenUsage: jsonb("token_usage").$type<Record<string, unknown>>(),
  retryCount: integer("retry_count").notNull().default(0),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertP04ReportResultSchema = createInsertSchema(p04ReportResultsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertP04ReportResult = z.infer<typeof insertP04ReportResultSchema>;
export type P04ReportResult = typeof p04ReportResultsTable.$inferSelect;
