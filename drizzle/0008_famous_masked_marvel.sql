CREATE TABLE `p04_report_results` (
	`id` text PRIMARY KEY NOT NULL,
	`diagnostic_id` text NOT NULL,
	`analysis_run_id` text NOT NULL,
	`p01_analysis_result_id` text NOT NULL,
	`target_archetype_result_id` text NOT NULL,
	`p02_analysis_result_id` text NOT NULL,
	`resolved_transition_plan_id` text NOT NULL,
	`money_now_selection_id` text NOT NULL,
	`p03_prescription_result_id` text NOT NULL,
	`upstream_hashes_json` text NOT NULL,
	`stage_version` text NOT NULL,
	`prompt_version` text NOT NULL,
	`output_schema_version` text NOT NULL,
	`prompt_sha256` text NOT NULL,
	`rule_versions_json` text NOT NULL,
	`context_json` text NOT NULL,
	`context_hash` text NOT NULL,
	`report_policy_json` text NOT NULL,
	`source_registry_json` text NOT NULL,
	`source_registry_hash` text NOT NULL,
	`report_glossary_json` text NOT NULL,
	`input_hash` text NOT NULL,
	`deterministic_input_hash` text NOT NULL,
	`result_json` text,
	`provider_raw_response_json` text,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	`latency_ms` integer NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer,
	`cost_usd` real,
	`retry_count` integer NOT NULL,
	`technical_retry_count` integer NOT NULL,
	`reevaluation_retry_count` integer NOT NULL,
	`failure_code` text,
	`failure_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`diagnostic_id`) REFERENCES `diagnostics`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`p01_analysis_result_id`) REFERENCES `p01_analysis_results`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`target_archetype_result_id`) REFERENCES `target_archetype_results`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`p02_analysis_result_id`) REFERENCES `p02_analysis_results`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`resolved_transition_plan_id`) REFERENCES `resolved_transition_plans`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`money_now_selection_id`) REFERENCES `money_now_selections`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`p03_prescription_result_id`) REFERENCES `p03_prescription_results`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `p04_report_results_run_unique` ON `p04_report_results` (`analysis_run_id`);--> statement-breakpoint
CREATE INDEX `p04_report_results_p01_idx` ON `p04_report_results` (`p01_analysis_result_id`);--> statement-breakpoint
CREATE INDEX `p04_report_results_target_idx` ON `p04_report_results` (`target_archetype_result_id`);--> statement-breakpoint
CREATE INDEX `p04_report_results_p02_idx` ON `p04_report_results` (`p02_analysis_result_id`);--> statement-breakpoint
CREATE INDEX `p04_report_results_plan_idx` ON `p04_report_results` (`resolved_transition_plan_id`);--> statement-breakpoint
CREATE INDEX `p04_report_results_selection_idx` ON `p04_report_results` (`money_now_selection_id`);--> statement-breakpoint
CREATE INDEX `p04_report_results_p03_idx` ON `p04_report_results` (`p03_prescription_result_id`);--> statement-breakpoint
CREATE INDEX `p04_report_results_input_hash_idx` ON `p04_report_results` (`deterministic_input_hash`);