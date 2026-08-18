CREATE TABLE `p02_analysis_results` (
	`id` text PRIMARY KEY NOT NULL,
	`diagnostic_id` text NOT NULL,
	`analysis_run_id` text NOT NULL,
	`p01_analysis_result_id` text NOT NULL,
	`target_archetype_result_id` text NOT NULL,
	`p01_result_hash` text NOT NULL,
	`target_result_hash` text NOT NULL,
	`prompt_version` text NOT NULL,
	`output_schema_version` text NOT NULL,
	`rule_versions_json` text NOT NULL,
	`input_hash` text NOT NULL,
	`strategy_context_json` text NOT NULL,
	`target_config_json` text NOT NULL,
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
	FOREIGN KEY (`target_archetype_result_id`) REFERENCES `target_archetype_results`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `p02_analysis_results_run_unique` ON `p02_analysis_results` (`analysis_run_id`);--> statement-breakpoint
CREATE INDEX `p02_analysis_results_p01_idx` ON `p02_analysis_results` (`p01_analysis_result_id`);--> statement-breakpoint
CREATE INDEX `p02_analysis_results_target_idx` ON `p02_analysis_results` (`target_archetype_result_id`);--> statement-breakpoint
CREATE INDEX `p02_analysis_results_input_hash_idx` ON `p02_analysis_results` (`input_hash`);