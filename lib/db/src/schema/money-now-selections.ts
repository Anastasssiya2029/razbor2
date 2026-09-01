import { jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { moneyNowSelectionStatusEnum, cabinetSchema } from "./enums";
import { analysisRunsTable } from "./analysis-runs";
import { p01AnalysisResultsTable } from "./p01-analysis-results";
import { resolvedTransitionPlansTable } from "./resolved-transition-plans";

// Deterministic Money Now Selector: picks (if eligible) a fast-cash scenario
// from the fixed scenario catalog based on facts extracted from the
// diagnostic + resolved plan. Immutable snapshot keyed by deterministic input hash.
export const moneyNowSelectionsTable = cabinetSchema.table("money_now_selections", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisRunId: uuid("analysis_run_id")
    .notNull()
    .unique()
    .references(() => analysisRunsTable.id, { onDelete: "cascade" }),
  p01AnalysisResultId: uuid("p01_analysis_result_id")
    .notNull()
    .references(() => p01AnalysisResultsTable.id),
  resolvedTransitionPlanId: uuid("resolved_transition_plan_id")
    .notNull()
    .references(() => resolvedTransitionPlansTable.id),
  selectorContractVersion: text("selector_contract_version").notNull(),
  businessMethodologyVersion: text("business_methodology_version").notNull(),
  deterministicInputHash: text("deterministic_input_hash").notNull(),
  selectorInput: jsonb("selector_input").$type<Record<string, unknown>>(),
  selectionStatus: moneyNowSelectionStatusEnum("selection_status").notNull(),
  // { selectedScenario, candidateTrace, rankingTrace } when status = "selected"
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>(),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMoneyNowSelectionSchema = createInsertSchema(moneyNowSelectionsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMoneyNowSelection = z.infer<typeof insertMoneyNowSelectionSchema>;
export type MoneyNowSelection = typeof moneyNowSelectionsTable.$inferSelect;
