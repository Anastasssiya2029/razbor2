import { sql } from "drizzle-orm";
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appUsers = sqliteTable(
  "app_users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull(),
    status: text("status").notNull().default("invited"),
    authSubject: text("auth_subject"),
    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("app_users_email_unique").on(table.email),
    uniqueIndex("app_users_auth_subject_unique").on(table.authSubject),
    index("app_users_role_status_idx").on(table.role, table.status),
    check("app_users_role_check", sql`${table.role} in ('architect','admin','manager')`),
    check("app_users_status_check", sql`${table.status} in ('invited','active','disabled')`),
  ],
);

export const appSessions = sqliteTable(
  "app_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "cascade", onUpdate: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at").notNull(),
    lastSeenAt: integer("last_seen_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("app_sessions_token_hash_unique").on(table.tokenHash),
    index("app_sessions_user_idx").on(table.userId),
    index("app_sessions_expiry_idx").on(table.expiresAt),
  ],
);

export const clients = sqliteTable(
  "clients",
  {
    id: text("id").primaryKey(),
    displayName: text("display_name").notNull(),
    niche: text("niche"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "restrict", onUpdate: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("clients_owner_created_idx").on(table.createdByUserId, table.createdAt),
    index("clients_name_idx").on(table.displayName),
  ],
);

export const diagnostics = sqliteTable(
  "diagnostics",
  {
    id: text("id").primaryKey(),
    schemaVersion: text("schema_version").notNull(),
    sourceSchemaVersion: text("source_schema_version").notNull(),
    methodologyVersion: text("methodology_version").notNull(),
    clientId: text("client_id").references(() => clients.id, { onDelete: "restrict", onUpdate: "cascade" }),
    ownerUserId: text("owner_user_id").references(() => appUsers.id, { onDelete: "restrict", onUpdate: "cascade" }),
    rawAnswersJson: text("raw_answers_json").notNull(),
    normalizedInputJson: text("normalized_input_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("diagnostics_created_at_idx").on(table.createdAt),
    index("diagnostics_owner_created_idx").on(table.ownerUserId, table.createdAt),
    index("diagnostics_client_idx").on(table.clientId),
  ],
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

export const analysisRunLocks = sqliteTable(
  "analysis_run_locks",
  {
    analysisRunId: text("analysis_run_id")
      .primaryKey()
      .references(() => analysisRuns.id, { onDelete: "cascade", onUpdate: "cascade" }),
    token: text("token").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("analysis_run_locks_expiry_idx").on(table.expiresAt)],
);

export const analysisGifts = sqliteTable(
  "analysis_gifts",
  {
    id: text("id").primaryKey(),
    analysisRunId: text("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "restrict", onUpdate: "cascade" }),
    tariff: text("tariff").notNull(),
    prizeCode: text("prize_code").notNull(),
    prizeName: text("prize_name").notNull(),
    selectedByUserId: text("selected_by_user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "restrict", onUpdate: "cascade" }),
    selectedAt: text("selected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("analysis_gifts_run_unique").on(table.analysisRunId),
    index("analysis_gifts_selected_by_idx").on(table.selectedByUserId),
    check("analysis_gifts_tariff_check", sql`${table.tariff} in ('self','support')`),
  ],
);

export const analysisSheetSyncs = sqliteTable(
  "analysis_sheet_syncs",
  {
    analysisRunId: text("analysis_run_id")
      .primaryKey()
      .references(() => analysisRuns.id, { onDelete: "cascade", onUpdate: "cascade" }),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    syncedAt: text("synced_at"),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("analysis_sheet_syncs_status_idx").on(table.status),
    check("analysis_sheet_syncs_status_check", sql`${table.status} in ('pending','synced','failed','not_configured')`),
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

export const analysisPlanManagerVersions = sqliteTable(
  "analysis_plan_manager_versions",
  {
    id: text("id").primaryKey(),
    analysisRunId: text("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "cascade", onUpdate: "cascade" }),
    sourceResultHash: text("source_result_hash").notNull(),
    contentJson: text("content_json").notNull(),
    revision: integer("revision").notNull().default(1),
    updatedByUserId: text("updated_by_user_id")
      .notNull()
      .references(() => appUsers.id, { onDelete: "restrict", onUpdate: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("analysis_plan_manager_versions_run_unique").on(table.analysisRunId),
    index("analysis_plan_manager_versions_editor_idx").on(table.updatedByUserId),
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
    failureDetailsJson: text("failure_details_json"),
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

export const p03PrescriptionResults = sqliteTable(
  "p03_prescription_results",
  {
    id: text("id").primaryKey(),
    diagnosticId: text("diagnostic_id")
      .notNull()
      .references(() => diagnostics.id, { onDelete: "restrict", onUpdate: "cascade" }),
    analysisRunId: text("analysis_run_id")
      .notNull()
      .references(() => analysisRuns.id, { onDelete: "restrict", onUpdate: "cascade" }),
    moneyNowSelectionId: text("money_now_selection_id")
      .notNull()
      .references(() => moneyNowSelections.id, { onDelete: "restrict", onUpdate: "cascade" }),
    moneyNowSelectionHash: text("money_now_selection_hash").notNull(),
    p01AnalysisResultId: text("p01_analysis_result_id")
      .notNull()
      .references(() => p01AnalysisResults.id, { onDelete: "restrict", onUpdate: "cascade" }),
    p01ResultHash: text("p01_result_hash").notNull(),
    stageVersion: text("stage_version").notNull(),
    promptVersion: text("prompt_version").notNull(),
    outputSchemaVersion: text("output_schema_version").notNull(),
    ruleVersionsJson: text("rule_versions_json").notNull(),
    contextHash: text("context_hash"),
    inputHash: text("input_hash").notNull(),
    deterministicInputHash: text("deterministic_input_hash").notNull(),
    contextJson: text("context_json"),
    selectedScenarioJson: text("selected_scenario_json"),
    backendMetricsJson: text("backend_metrics_json").notNull(),
    backendRevenueScenarioJson: text("backend_revenue_scenario_json"),
    lockedTeaserVersion: text("locked_teaser_version").notNull(),
    lockedTeaser: text("locked_teaser").notNull(),
    resultJson: text("result_json"),
    skippedOutcomeJson: text("skipped_outcome_json"),
    providerRawResponseJson: text("provider_raw_response_json"),
    provider: text("provider"),
    model: text("model"),
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
    uniqueIndex("p03_prescription_results_run_unique").on(table.analysisRunId),
    index("p03_prescription_results_selection_idx").on(table.moneyNowSelectionId),
    index("p03_prescription_results_p01_idx").on(table.p01AnalysisResultId),
    index("p03_prescription_results_input_hash_idx").on(table.deterministicInputHash),
  ],
);

export const p04ReportResults = sqliteTable(
  "p04_report_results",
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
    p02AnalysisResultId: text("p02_analysis_result_id")
      .notNull()
      .references(() => p02AnalysisResults.id, { onDelete: "restrict", onUpdate: "cascade" }),
    resolvedTransitionPlanId: text("resolved_transition_plan_id")
      .notNull()
      .references(() => resolvedTransitionPlans.id, { onDelete: "restrict", onUpdate: "cascade" }),
    moneyNowSelectionId: text("money_now_selection_id")
      .notNull()
      .references(() => moneyNowSelections.id, { onDelete: "restrict", onUpdate: "cascade" }),
    p03PrescriptionResultId: text("p03_prescription_result_id")
      .notNull()
      .references(() => p03PrescriptionResults.id, { onDelete: "restrict", onUpdate: "cascade" }),
    upstreamHashesJson: text("upstream_hashes_json").notNull(),
    stageVersion: text("stage_version").notNull(),
    promptVersion: text("prompt_version").notNull(),
    outputSchemaVersion: text("output_schema_version").notNull(),
    promptSha256: text("prompt_sha256").notNull(),
    ruleVersionsJson: text("rule_versions_json").notNull(),
    contextJson: text("context_json").notNull(),
    contextHash: text("context_hash").notNull(),
    reportPolicyJson: text("report_policy_json").notNull(),
    sourceRegistryJson: text("source_registry_json").notNull(),
    sourceRegistryHash: text("source_registry_hash").notNull(),
    reportGlossaryJson: text("report_glossary_json").notNull(),
    inputHash: text("input_hash").notNull(),
    deterministicInputHash: text("deterministic_input_hash").notNull(),
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
    attemptDiagnosticsJson: text("attempt_diagnostics_json").notNull().default("[]"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("p04_report_results_run_unique").on(table.analysisRunId),
    index("p04_report_results_p01_idx").on(table.p01AnalysisResultId),
    index("p04_report_results_target_idx").on(table.targetArchetypeResultId),
    index("p04_report_results_p02_idx").on(table.p02AnalysisResultId),
    index("p04_report_results_plan_idx").on(table.resolvedTransitionPlanId),
    index("p04_report_results_selection_idx").on(table.moneyNowSelectionId),
    index("p04_report_results_p03_idx").on(table.p03PrescriptionResultId),
    index("p04_report_results_input_hash_idx").on(table.deterministicInputHash),
  ],
);
