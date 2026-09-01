import { integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cabinetSchema } from "./enums";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { analysisRunsTable } from "./analysis-runs";
import { diagnosticsTable } from "./diagnostics";

// P-01 (AI): reads the normalized diagnostic and produces evidence-backed 0-10
// scores for the 7 elements. One immutable row per run -- a retry replaces the
// row's content but the run keeps a single row (retries are for individual
// failed elements only, tracked via retryCount, per the reference architecture).
export const p01AnalysisResultsTable = cabinetSchema.table("p01_analysis_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisRunId: uuid("analysis_run_id")
    .notNull()
    .unique()
    .references(() => analysisRunsTable.id, { onDelete: "cascade" }),
  diagnosticId: uuid("diagnostic_id")
    .notNull()
    .references(() => diagnosticsTable.id),
  promptVersion: text("prompt_version").notNull(),
  outputSchemaVersion: text("output_schema_version").notNull(),
  inputHash: text("input_hash").notNull(),
  resultHash: text("result_hash"),
  // { scores: Record<ElementId, number>, evidence: Record<ElementId, {quote, rationale}[]> }
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

export const insertP01AnalysisResultSchema = createInsertSchema(p01AnalysisResultsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertP01AnalysisResult = z.infer<typeof insertP01AnalysisResultSchema>;
export type P01AnalysisResult = typeof p01AnalysisResultsTable.$inferSelect;
