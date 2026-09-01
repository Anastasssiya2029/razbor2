CREATE SCHEMA "cabinet";
--> statement-breakpoint
CREATE TYPE "cabinet"."analysis_run_status" AS ENUM('draft', 'queued', 'scoring', 'targeting', 'strategizing', 'resolving_tasks', 'money_now', 'money_now_prescribing', 'writing_report', 'ready', 'analysis_failed');--> statement-breakpoint
CREATE TYPE "cabinet"."app_invite_status" AS ENUM('pending', 'accepted', 'revoked');--> statement-breakpoint
CREATE TYPE "cabinet"."app_role" AS ENUM('architect', 'admin', 'manager');--> statement-breakpoint
CREATE TYPE "cabinet"."app_user_status" AS ENUM('invited', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "cabinet"."money_now_selection_status" AS ENUM('selected', 'no_eligible_scenario');--> statement-breakpoint
CREATE TYPE "cabinet"."p03_status" AS ENUM('prescribed', 'skipped_no_scenario');--> statement-breakpoint
CREATE TABLE "cabinet"."app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" "cabinet"."app_role" NOT NULL,
	"status" "cabinet"."app_user_status" DEFAULT 'invited' NOT NULL,
	"password_hash" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "cabinet"."app_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"status" "cabinet"."app_invite_status" DEFAULT 'pending' NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "cabinet"."app_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "cabinet"."clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"niche" text,
	"contact_info" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cabinet"."diagnostics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"input_schema_version" text DEFAULT 'diagnostic-input.v1' NOT NULL,
	"raw_answers" jsonb NOT NULL,
	"normalized_input" jsonb NOT NULL,
	"normalized_input_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cabinet"."analysis_run_locks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"locked_stage" text NOT NULL,
	"lock_token" text NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "analysis_run_locks_analysis_run_id_unique" UNIQUE("analysis_run_id")
);
--> statement-breakpoint
CREATE TABLE "cabinet"."analysis_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"status" "cabinet"."analysis_run_status" DEFAULT 'draft' NOT NULL,
	"error_code" text,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cabinet"."p01_analysis_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"prompt_version" text NOT NULL,
	"output_schema_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"result_hash" text,
	"result" jsonb,
	"provider_raw_response" jsonb,
	"provider_model" text,
	"token_usage" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "p01_analysis_results_analysis_run_id_unique" UNIQUE("analysis_run_id")
);
--> statement-breakpoint
CREATE TABLE "cabinet"."target_archetype_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"p01_analysis_result_id" uuid NOT NULL,
	"p01_result_hash" text NOT NULL,
	"resource_versions" jsonb NOT NULL,
	"current_scores" jsonb,
	"archetype" jsonb,
	"target" jsonb,
	"deterministic_input_hash" text NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "target_archetype_results_analysis_run_id_unique" UNIQUE("analysis_run_id")
);
--> statement-breakpoint
CREATE TABLE "cabinet"."p02_analysis_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"target_archetype_result_id" uuid NOT NULL,
	"target_result_hash" text NOT NULL,
	"prompt_version" text NOT NULL,
	"output_schema_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"result_hash" text,
	"result" jsonb,
	"provider_raw_response" jsonb,
	"provider_model" text,
	"token_usage" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "p02_analysis_results_analysis_run_id_unique" UNIQUE("analysis_run_id")
);
--> statement-breakpoint
CREATE TABLE "cabinet"."resolved_transition_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"p02_analysis_result_id" uuid NOT NULL,
	"p02_result_hash" text NOT NULL,
	"transition_registry_version" text NOT NULL,
	"deterministic_input_hash" text NOT NULL,
	"plan" jsonb,
	"failure_code" text,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resolved_transition_plans_analysis_run_id_unique" UNIQUE("analysis_run_id")
);
--> statement-breakpoint
CREATE TABLE "cabinet"."money_now_selections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"p01_analysis_result_id" uuid NOT NULL,
	"resolved_transition_plan_id" uuid NOT NULL,
	"selector_contract_version" text NOT NULL,
	"business_methodology_version" text NOT NULL,
	"deterministic_input_hash" text NOT NULL,
	"selector_input" jsonb,
	"selection_status" "cabinet"."money_now_selection_status" NOT NULL,
	"snapshot" jsonb,
	"failure_code" text,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_now_selections_analysis_run_id_unique" UNIQUE("analysis_run_id")
);
--> statement-breakpoint
CREATE TABLE "cabinet"."p03_prescription_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"money_now_selection_id" uuid NOT NULL,
	"status" "cabinet"."p03_status" NOT NULL,
	"prompt_version" text,
	"output_schema_version" text,
	"input_hash" text,
	"result_hash" text,
	"result" jsonb,
	"provider_raw_response" jsonb,
	"provider_model" text,
	"token_usage" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "p03_prescription_results_analysis_run_id_unique" UNIQUE("analysis_run_id")
);
--> statement-breakpoint
CREATE TABLE "cabinet"."p04_report_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"p03_prescription_result_id" uuid NOT NULL,
	"prompt_version" text NOT NULL,
	"output_schema_version" text NOT NULL,
	"input_hash" text NOT NULL,
	"result_hash" text,
	"result" jsonb,
	"provider_raw_response" jsonb,
	"provider_model" text,
	"token_usage" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "p04_report_results_analysis_run_id_unique" UNIQUE("analysis_run_id")
);
--> statement-breakpoint
CREATE TABLE "cabinet"."analysis_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_run_id" uuid NOT NULL,
	"diagnostic_id" uuid NOT NULL,
	"schema_version" text DEFAULT 'analysis-result.v1' NOT NULL,
	"result_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"assembled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_results_analysis_run_id_unique" UNIQUE("analysis_run_id")
);
--> statement-breakpoint
CREATE TABLE "cabinet"."analysis_plan_manager_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_result_id" uuid NOT NULL,
	"manager_user_id" uuid NOT NULL,
	"title" text DEFAULT 'Мой план' NOT NULL,
	"plan_items" jsonb NOT NULL,
	"is_canonical_reset" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cabinet"."analysis_gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"analysis_result_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"gift_id" text NOT NULL,
	"gift_label" text NOT NULL,
	"drawn_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analysis_gifts_analysis_result_id_unique" UNIQUE("analysis_result_id")
);
--> statement-breakpoint
ALTER TABLE "cabinet"."app_invites" ADD CONSTRAINT "app_invites_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cabinet"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."app_invites" ADD CONSTRAINT "app_invites_invited_by_user_id_app_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "cabinet"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."app_sessions" ADD CONSTRAINT "app_sessions_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "cabinet"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."clients" ADD CONSTRAINT "clients_owner_user_id_app_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "cabinet"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."diagnostics" ADD CONSTRAINT "diagnostics_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "cabinet"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."diagnostics" ADD CONSTRAINT "diagnostics_owner_user_id_app_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "cabinet"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."analysis_run_locks" ADD CONSTRAINT "analysis_run_locks_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "cabinet"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."analysis_runs" ADD CONSTRAINT "analysis_runs_diagnostic_id_diagnostics_id_fk" FOREIGN KEY ("diagnostic_id") REFERENCES "cabinet"."diagnostics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."analysis_runs" ADD CONSTRAINT "analysis_runs_owner_user_id_app_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "cabinet"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."p01_analysis_results" ADD CONSTRAINT "p01_analysis_results_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "cabinet"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."p01_analysis_results" ADD CONSTRAINT "p01_analysis_results_diagnostic_id_diagnostics_id_fk" FOREIGN KEY ("diagnostic_id") REFERENCES "cabinet"."diagnostics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."target_archetype_results" ADD CONSTRAINT "target_archetype_results_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "cabinet"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."target_archetype_results" ADD CONSTRAINT "target_archetype_results_p01_analysis_result_id_p01_analysis_results_id_fk" FOREIGN KEY ("p01_analysis_result_id") REFERENCES "cabinet"."p01_analysis_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."p02_analysis_results" ADD CONSTRAINT "p02_analysis_results_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "cabinet"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."p02_analysis_results" ADD CONSTRAINT "p02_analysis_results_target_archetype_result_id_target_archetype_results_id_fk" FOREIGN KEY ("target_archetype_result_id") REFERENCES "cabinet"."target_archetype_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."resolved_transition_plans" ADD CONSTRAINT "resolved_transition_plans_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "cabinet"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."resolved_transition_plans" ADD CONSTRAINT "resolved_transition_plans_p02_analysis_result_id_p02_analysis_results_id_fk" FOREIGN KEY ("p02_analysis_result_id") REFERENCES "cabinet"."p02_analysis_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."money_now_selections" ADD CONSTRAINT "money_now_selections_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "cabinet"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."money_now_selections" ADD CONSTRAINT "money_now_selections_p01_analysis_result_id_p01_analysis_results_id_fk" FOREIGN KEY ("p01_analysis_result_id") REFERENCES "cabinet"."p01_analysis_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."money_now_selections" ADD CONSTRAINT "money_now_selections_resolved_transition_plan_id_resolved_transition_plans_id_fk" FOREIGN KEY ("resolved_transition_plan_id") REFERENCES "cabinet"."resolved_transition_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."p03_prescription_results" ADD CONSTRAINT "p03_prescription_results_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "cabinet"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."p03_prescription_results" ADD CONSTRAINT "p03_prescription_results_money_now_selection_id_money_now_selections_id_fk" FOREIGN KEY ("money_now_selection_id") REFERENCES "cabinet"."money_now_selections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."p04_report_results" ADD CONSTRAINT "p04_report_results_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "cabinet"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."p04_report_results" ADD CONSTRAINT "p04_report_results_p03_prescription_result_id_p03_prescription_results_id_fk" FOREIGN KEY ("p03_prescription_result_id") REFERENCES "cabinet"."p03_prescription_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."analysis_results" ADD CONSTRAINT "analysis_results_analysis_run_id_analysis_runs_id_fk" FOREIGN KEY ("analysis_run_id") REFERENCES "cabinet"."analysis_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."analysis_results" ADD CONSTRAINT "analysis_results_diagnostic_id_diagnostics_id_fk" FOREIGN KEY ("diagnostic_id") REFERENCES "cabinet"."diagnostics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."analysis_plan_manager_versions" ADD CONSTRAINT "analysis_plan_manager_versions_analysis_result_id_analysis_results_id_fk" FOREIGN KEY ("analysis_result_id") REFERENCES "cabinet"."analysis_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."analysis_plan_manager_versions" ADD CONSTRAINT "analysis_plan_manager_versions_manager_user_id_app_users_id_fk" FOREIGN KEY ("manager_user_id") REFERENCES "cabinet"."app_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."analysis_gifts" ADD CONSTRAINT "analysis_gifts_analysis_result_id_analysis_results_id_fk" FOREIGN KEY ("analysis_result_id") REFERENCES "cabinet"."analysis_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cabinet"."analysis_gifts" ADD CONSTRAINT "analysis_gifts_owner_user_id_app_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "cabinet"."app_users"("id") ON DELETE no action ON UPDATE no action;