CREATE TABLE `target_archetype_results` (
	`id` text PRIMARY KEY NOT NULL,
	`diagnostic_id` text NOT NULL,
	`analysis_run_id` text NOT NULL,
	`p01_analysis_result_id` text,
	`p01_input_hash` text,
	`p01_result_hash` text,
	`current_scores_json` text,
	`target_input_json` text,
	`target_result_json` text,
	`archetype_result_json` text,
	`resource_versions_json` text NOT NULL,
	`deterministic_input_hash` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`failure_code` text,
	`failure_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`diagnostic_id`) REFERENCES `diagnostics`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`p01_analysis_result_id`) REFERENCES `p01_analysis_results`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `target_archetype_results_run_unique` ON `target_archetype_results` (`analysis_run_id`);--> statement-breakpoint
CREATE INDEX `target_archetype_results_diagnostic_idx` ON `target_archetype_results` (`diagnostic_id`);--> statement-breakpoint
CREATE INDEX `target_archetype_results_p01_idx` ON `target_archetype_results` (`p01_analysis_result_id`);--> statement-breakpoint
CREATE INDEX `target_archetype_results_input_hash_idx` ON `target_archetype_results` (`deterministic_input_hash`);