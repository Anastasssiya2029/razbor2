import { jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cabinetSchema } from "./enums";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { analysisRunsTable } from "./analysis-runs";
import { p01AnalysisResultsTable } from "./p01-analysis-results";

// Deterministic stage (no AI): Business Archetype selection (gated by
// mandatory/optional element minimums) + Target Configuration (target score
// per element derived from model family + capability floors + modifiers).
export const targetArchetypeResultsTable = cabinetSchema.table("target_archetype_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisRunId: uuid("analysis_run_id")
    .notNull()
    .unique()
    .references(() => analysisRunsTable.id, { onDelete: "cascade" }),
  p01AnalysisResultId: uuid("p01_analysis_result_id")
    .notNull()
    .references(() => p01AnalysisResultsTable.id),
  p01ResultHash: text("p01_result_hash").notNull(),
  resourceVersions: jsonb("resource_versions").$type<Record<string, string>>().notNull(),
  currentScores: jsonb("current_scores").$type<Record<string, number>>(),
  // BusinessArchetypeResult: { archetypeId, totalScore, gateDowngrades, ... }
  archetype: jsonb("archetype").$type<Record<string, unknown>>(),
  // TargetConfigurationResult: { modelFamily, hybridComponents, targetScores, gap, requiredMinimum, modelFitWarnings }
  target: jsonb("target").$type<Record<string, unknown>>(),
  deterministicInputHash: text("deterministic_input_hash").notNull(),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTargetArchetypeResultSchema = createInsertSchema(
  targetArchetypeResultsTable,
).omit({ id: true, createdAt: true });
export type InsertTargetArchetypeResult = z.infer<typeof insertTargetArchetypeResultSchema>;
export type TargetArchetypeResult = typeof targetArchetypeResultsTable.$inferSelect;
