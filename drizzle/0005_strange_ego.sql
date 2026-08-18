CREATE TABLE `resolved_transition_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`diagnostic_id` text NOT NULL,
	`analysis_run_id` text NOT NULL,
	`p01_analysis_result_id` text,
	`target_archetype_result_id` text,
	`p02_analysis_result_id` text,
	`p02_result_hash` text,
	`target_result_hash` text,
	`stage_version` text NOT NULL,
	`transition_registry_version` text NOT NULL,
	`deterministic_input_hash` text NOT NULL,
	`plan_json` text,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`failure_code` text,
	`failure_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`diagnostic_id`) REFERENCES `diagnostics`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`p01_analysis_result_id`) REFERENCES `p01_analysis_results`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`target_archetype_result_id`) REFERENCES `target_archetype_results`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`p02_analysis_result_id`) REFERENCES `p02_analysis_results`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resolved_transition_plans_run_unique` ON `resolved_transition_plans` (`analysis_run_id`);--> statement-breakpoint
CREATE INDEX `resolved_transition_plans_p01_idx` ON `resolved_transition_plans` (`p01_analysis_result_id`);--> statement-breakpoint
CREATE INDEX `resolved_transition_plans_target_idx` ON `resolved_transition_plans` (`target_archetype_result_id`);--> statement-breakpoint
CREATE INDEX `resolved_transition_plans_p02_idx` ON `resolved_transition_plans` (`p02_analysis_result_id`);--> statement-breakpoint
CREATE INDEX `resolved_transition_plans_input_hash_idx` ON `resolved_transition_plans` (`deterministic_input_hash`);