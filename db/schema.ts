import { sql } from "drizzle-orm";
import { check, index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const diagnostics = sqliteTable(
  "diagnostics",
  {
    id: text("id").primaryKey(),
    schemaVersion: text("schema_version").notNull(),
    sourceSchemaVersion: text("source_schema_version").notNull(),
    methodologyVersion: text("methodology_version").notNull(),
    rawAnswersJson: text("raw_answers_json").notNull(),
    normalizedInputJson: text("normalized_input_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("diagnostics_created_at_idx").on(table.createdAt)],
);

export const analysisRuns = sqliteTable(
  "analysis_runs",
  {
    id: text("id").primaryKey(),
    diagnosticId: text("diagnostic_id")
      .notNull()
      .references(() => diagnostics.id, { onDelete: "restrict", onUpdate: "cascade" }),
    status: text("status").notNull().default("scoring"),
    schemaVersion: text("schema_version").notNull(),
    methodologyVersion: text("methodology_version").notNull(),
    promptVersionsJson: text("prompt_versions_json").notNull().default("{}"),
    modelMetadataJson: text("model_metadata_json").notNull().default("{}"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("analysis_runs_diagnostic_idx").on(table.diagnosticId),
    index("analysis_runs_status_idx").on(table.status),
    check(
      "analysis_runs_status_check",
      sql`${table.status} in ('scoring','targeting','strategizing','money_now','resolving_tasks','writing_report','ready','failed')`,
    ),
  ],
);

export const analysisResults = sqliteTable(
  "analysis_results",
  {
    id: text("id").primaryKey(),
    diagnosticId: text("diagnostic_id")
      .notNull()
      .references(() => diagnostics.id, { onDelete: "restrict", onUpdate: "cascade" }),
    analysisRunId: text("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "restrict", onUpdate: "cascade" }),
    schemaVersion: text("schema_version").notNull(),
    methodologyVersion: text("methodology_version").notNull(),
    resultJson: text("result_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("analysis_results_run_unique").on(table.analysisRunId),
    index("analysis_results_diagnostic_idx").on(table.diagnosticId),
  ],
);
