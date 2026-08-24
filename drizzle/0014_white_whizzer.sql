CREATE TABLE `analysis_plan_manager_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_run_id` text NOT NULL,
	`source_result_hash` text NOT NULL,
	`content_json` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `app_users`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_plan_manager_versions_run_unique` ON `analysis_plan_manager_versions` (`analysis_run_id`);--> statement-breakpoint
CREATE INDEX `analysis_plan_manager_versions_editor_idx` ON `analysis_plan_manager_versions` (`updated_by_user_id`);