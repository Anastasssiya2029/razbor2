import { jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cabinetSchema } from "./enums";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { analysisRunsTable } from "./analysis-runs";
import { diagnosticsTable } from "./diagnostics";

// The final, immutable, client-facing document (analysis-result.v1):
// deterministic composition of every prior stage's output. Never edited in
// place -- a re-run of the pipeline creates a new analysis_runs row.
export const analysisResultsTable = cabinetSchema.table("analysis_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisRunId: uuid("analysis_run_id")
    .notNull()
    .unique()
    .references(() => analysisRunsTable.id, { onDelete: "cascade" }),
  diagnosticId: uuid("diagnostic_id")
    .notNull()
    .references(() => diagnosticsTable.id),
  schemaVersion: text("schema_version").notNull().default("analysis-result.v1"),
  resultHash: text("result_hash").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  assembledAt: timestamp("assembled_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAnalysisResultSchema = createInsertSchema(analysisResultsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAnalysisResult = z.infer<typeof insertAnalysisResultSchema>;
export type AnalysisResult = typeof analysisResultsTable.$inferSelect;
