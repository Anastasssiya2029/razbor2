import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    status: text("status").notNull().default("queued"),
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
      sql`${table.status} in ('draft','queued','scoring','targeting','strategizing','money_now','resolving_tasks','writing_report','ready','analysis_failed')`,
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

export const p01AnalysisResults = sqliteTable(
  "p01_analysis_results",
  {
    id: text("id").primaryKey(),
    diagnosticId: text("diagnostic_id")
      .notNull()
      .references(() => diagnostics.id, { onDelete: "restrict", onUpdate: "cascade" }),
    analysisRunId: text("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "restrict", onUpdate: "cascade" }),
    promptVersion: text("prompt_version").notNull(),
    outputSchemaVersion: text("output_schema_version").notNull(),
    ruleVersionsJson: text("rule_versions_json").notNull(),
    inputHash: text("input_hash").notNull(),
    resultJson: text("result_json"),
    providerRawResponseJson: text("provider_raw_response_json"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    costUsd: real("cost_usd"),
    retryCount: integer("retry_count").notNull(),
    technicalRetryCount: integer("technical_retry_count").notNull(),
    reevaluationRetryCount: integer("reevaluation_retry_count").notNull(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("p01_analysis_results_run_unique").on(table.analysisRunId),
    index("p01_analysis_results_diagnostic_idx").on(table.diagnosticId),
    index("p01_analysis_results_input_hash_idx").on(table.inputHash),
  ],
);

export const targetArchetypeResults = sqliteTable(
  "target_archetype_results",
  {
    id: text("id").primaryKey(),
    diagnosticId: text("diagnostic_id")
      .notNull()
      .references(() => diagnostics.id, { onDelete: "restrict", onUpdate: "cascade" }),
    analysisRunId: text("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "restrict", onUpdate: "cascade" }),
    p01AnalysisResultId: text("p01_analysis_result_id").references(() => p01AnalysisResults.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    p01InputHash: text("p01_input_hash"),
    p01ResultHash: text("p01_result_hash"),
    currentScoresJson: text("current_scores_json"),
    targetInputJson: text("target_input_json"),
    targetResultJson: text("target_result_json"),
    archetypeResultJson: text("archetype_result_json"),
    resourceVersionsJson: text("resource_versions_json").notNull(),
    deterministicInputHash: text("deterministic_input_hash").notNull(),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at").notNull(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("target_archetype_results_run_unique").on(table.analysisRunId),
    index("target_archetype_results_diagnostic_idx").on(table.diagnosticId),
    index("target_archetype_results_p01_idx").on(table.p01AnalysisResultId),
    index("target_archetype_results_input_hash_idx").on(table.deterministicInputHash),
  ],
);

export const p02AnalysisResults = sqliteTable(
  "p02_analysis_results",
  {
    id: text("id").primaryKey(),
    diagnosticId: text("diagnostic_id")
      .notNull()
      .references(() => diagnostics.id, { onDelete: "restrict", onUpdate: "cascade" }),
    analysisRunId: text("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "restrict", onUpdate: "cascade" }),
    p01AnalysisResultId: text("p01_analysis_result_id")
      .notNull()
      .references(() => p01AnalysisResults.id, { onDelete: "restrict", onUpdate: "cascade" }),
    targetArchetypeResultId: text("target_archetype_result_id")
      .notNull()
      .references(() => targetArchetypeResults.id, { onDelete: "restrict", onUpdate: "cascade" }),
    p01ResultHash: text("p01_result_hash").notNull(),
    targetResultHash: text("target_result_hash").notNull(),
    promptVersion: text("prompt_version").notNull(),
    outputSchemaVersion: text("output_schema_version").notNull(),
    ruleVersionsJson: text("rule_versions_json").notNull(),
    inputHash: text("input_hash").notNull(),
    strategyContextJson: text("strategy_context_json").notNull(),
    targetConfigJson: text("target_config_json").notNull(),
    resultJson: text("result_json"),
    providerRawResponseJson: text("provider_raw_response_json"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    startedAt: text("started_at").notNull(),
    finishedAt: text("finished_at").notNull(),
    latencyMs: integer("latency_ms").notNull(),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    costUsd: real("cost_usd"),
    retryCount: integer("retry_count").notNull(),
    technicalRetryCount: integer("technical_retry_count").notNull(),
    reevaluationRetryCount: integer("reevaluation_retry_count").notNull(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("p02_analysis_results_run_unique").on(table.analysisRunId),
    index("p02_analysis_results_p01_idx").on(table.p01AnalysisResultId),
    index("p02_analysis_results_target_idx").on(table.targetArchetypeResultId),
    index("p02_analysis_results_input_hash_idx").on(table.inputHash),
  ],
);

export const resolvedTransitionPlans = sqliteTable(
  "resolved_transition_plans",
  {
    id: text("id").primaryKey(),
    diagnosticId: text("diagnostic_id")
      .notNull()
      .references(() => diagnostics.id, { onDelete: "restrict", onUpdate: "cascade" }),
    analysisRunId: text("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "restrict", onUpdate: "cascade" }),
    p01AnalysisResultId: text("p01_analysis_result_id").references(() => p01AnalysisResults.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    targetArchetypeResultId: text("target_archetype_result_id").references(() => targetArchetypeResults.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    p02AnalysisResultId: text("p02_analysis_result_id").references(() => p02AnalysisResults.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    p02ResultHash: text("p02_result_hash"),
    targetResultHash: text("target_result_hash"),
    stageVersion: text("stage_version").notNull(),
    transitionRegistryVersion: text("transition_registry_version").notNull(),
    deterministicInputHash: text("deterministic_input_hash").notNull(),
    planJson: text("plan_json"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at").notNull(),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("resolved_transition_plans_run_unique").on(table.analysisRunId),
    index("resolved_transition_plans_p01_idx").on(table.p01AnalysisResultId),
    index("resolved_transition_plans_target_idx").on(table.targetArchetypeResultId),
    index("resolved_transition_plans_p02_idx").on(table.p02AnalysisResultId),
    index("resolved_transition_plans_input_hash_idx").on(table.deterministicInputHash),
  ],
);

export const moneyNowSelections = sqliteTable(
  "money_now_selections",
  {
    id: text("id").primaryKey(),
    diagnosticId: text("diagnostic_id")
      .notNull()
      .references(() => diagnostics.id, { onDelete: "restrict", onUpdate: "cascade" }),
    analysisRunId: text("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "restrict", onUpdate: "cascade" }),
    p01AnalysisResultId: text("p01_analysis_result_id").references(() => p01AnalysisResults.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    p01ResultHash: text("p01_result_hash"),
    taskResolverPlanId: text("task_resolver_plan_id").references(() => resolvedTransitionPlans.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    taskResolverPlanHash: text("task_resolver_plan_hash"),
    stageVersion: text("stage_version").notNull(),
    selectorContractVersion: text("selector_contract_version").notNull(),
    selectorContractJsonSha256: text("selector_contract_json_sha256").notNull(),
    selectorContractTsSha256: text("selector_contract_ts_sha256").notNull(),
    businessMethodologyVersion: text("business_methodology_version").notNull(),
    factExtractionVersion: text("fact_extraction_version").notNull(),
    selectorInputHash: text("selector_input_hash"),
    deterministicInputHash: text("deterministic_input_hash").notNull(),
    selectorInputJson: text("selector_input_json"),
    candidateTraceJson: text("candidate_trace_json"),
    selectionJson: text("selection_json"),
    startedAt: text("started_at").notNull(),
    completedAt: text("completed_at").notNull(),
    failureJson: text("failure_json"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("money_now_selections_run_unique").on(table.analysisRunId),
    index("money_now_selections_p01_idx").on(table.p01AnalysisResultId),
    index("money_now_selections_task_plan_idx").on(table.taskResolverPlanId),
    index("money_now_selections_input_hash_idx").on(table.deterministicInputHash),
  ],
);
