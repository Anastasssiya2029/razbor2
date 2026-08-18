CREATE TABLE `money_now_selections` (
	`id` text PRIMARY KEY NOT NULL,
	`diagnostic_id` text NOT NULL,
	`analysis_run_id` text NOT NULL,
	`p01_analysis_result_id` text,
	`p01_result_hash` text,
	`task_resolver_plan_id` text,
	`task_resolver_plan_hash` text,
	`stage_version` text NOT NULL,
	`selector_contract_version` text NOT NULL,
	`selector_contract_json_sha256` text NOT NULL,
	`selector_contract_ts_sha256` text NOT NULL,
	`business_methodology_version` text NOT NULL,
	`fact_extraction_version` text NOT NULL,
	`selector_input_hash` text,
	`deterministic_input_hash` text NOT NULL,
	`selector_input_json` text,
	`candidate_trace_json` text,
	`selection_json` text,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`failure_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`diagnostic_id`) REFERENCES `diagnostics`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`p01_analysis_result_id`) REFERENCES `p01_analysis_results`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`task_resolver_plan_id`) REFERENCES `resolved_transition_plans`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `money_now_selections_run_unique` ON `money_now_selections` (`analysis_run_id`);--> statement-breakpoint
CREATE INDEX `money_now_selections_p01_idx` ON `money_now_selections` (`p01_analysis_result_id`);--> statement-breakpoint
CREATE INDEX `money_now_selections_task_plan_idx` ON `money_now_selections` (`task_resolver_plan_id`);--> statement-breakpoint
CREATE INDEX `money_now_selections_input_hash_idx` ON `money_now_selections` (`deterministic_input_hash`);