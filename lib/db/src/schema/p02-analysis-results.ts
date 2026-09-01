import { integer, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cabinetSchema } from "./enums";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { analysisRunsTable } from "./analysis-runs";
import { targetArchetypeResultsTable } from "./target-archetype-results";

// P-02 (AI): reads current scores + target + archetype and produces the
// strategic narrative: bottleneck/root cause and an ordered elementSequence
// of milestones (element_id, from_score, to_score, role, why_now, unlocks).
export const p02AnalysisResultsTable = cabinetSchema.table("p02_analysis_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisRunId: uuid("analysis_run_id")
    .notNull()
    .unique()
    .references(() => analysisRunsTable.id, { onDelete: "cascade" }),
  targetArchetypeResultId: uuid("target_archetype_result_id")
    .notNull()
    .references(() => targetArchetypeResultsTable.id),
  targetResultHash: text("target_result_hash").notNull(),
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

export const insertP02AnalysisResultSchema = createInsertSchema(p02AnalysisResultsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertP02AnalysisResult = z.infer<typeof insertP02AnalysisResultSchema>;
export type P02AnalysisResult = typeof p02AnalysisResultsTable.$inferSelect;
