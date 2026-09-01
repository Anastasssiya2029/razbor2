import { jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cabinetSchema } from "./enums";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { analysisRunsTable } from "./analysis-runs";
import { p02AnalysisResultsTable } from "./p02-analysis-results";

// Deterministic Task Resolver: expands each P-02 milestone into atomic
// transitions from the Matrix 70 registry (one task per element score point),
// cross-validated against the milestone chain and registry content.
export const resolvedTransitionPlansTable = cabinetSchema.table("resolved_transition_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisRunId: uuid("analysis_run_id")
    .notNull()
    .unique()
    .references(() => analysisRunsTable.id, { onDelete: "cascade" }),
  p02AnalysisResultId: uuid("p02_analysis_result_id")
    .notNull()
    .references(() => p02AnalysisResultsTable.id),
  p02ResultHash: text("p02_result_hash").notNull(),
  transitionRegistryVersion: text("transition_registry_version").notNull(),
  deterministicInputHash: text("deterministic_input_hash").notNull(),
  // ResolvedTransitionPlan: { cards: [{ milestone, tasks: [...] }] }
  plan: jsonb("plan").$type<Record<string, unknown>>(),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertResolvedTransitionPlanSchema = createInsertSchema(
  resolvedTransitionPlansTable,
).omit({ id: true, createdAt: true });
export type InsertResolvedTransitionPlan = z.infer<typeof insertResolvedTransitionPlanSchema>;
export type ResolvedTransitionPlan = typeof resolvedTransitionPlansTable.$inferSelect;
