import { boolean, jsonb, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { cabinetSchema } from "./enums";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { analysisResultsTable } from "./analysis-results";
import { appUsersTable } from "./app-users";

// A manager's personal, editable working copy of the canonical task plan
// (check off tasks, tweak wording, add notes) kept separate from the
// immutable analysis_results.result so the canonical plan is never mutated.
export const analysisPlanManagerVersionsTable = cabinetSchema.table("analysis_plan_manager_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  analysisResultId: uuid("analysis_result_id")
    .notNull()
    .references(() => analysisResultsTable.id, { onDelete: "cascade" }),
  managerUserId: uuid("manager_user_id")
    .notNull()
    .references(() => appUsersTable.id),
  title: text("title").notNull().default("Мой план"),
  // [{ taskId, task, doneWhen, done, note }]
  planItems: jsonb("plan_items").$type<Record<string, unknown>[]>().notNull(),
  isCanonicalReset: boolean("is_canonical_reset").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertAnalysisPlanManagerVersionSchema = createInsertSchema(
  analysisPlanManagerVersionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAnalysisPlanManagerVersion = z.infer<
  typeof insertAnalysisPlanManagerVersionSchema
>;
export type AnalysisPlanManagerVersion = typeof analysisPlanManagerVersionsTable.$inferSelect;
