CREATE TABLE `analysis_results` (
	`id` text PRIMARY KEY NOT NULL,
	`diagnostic_id` text NOT NULL,
	`analysis_run_id` text NOT NULL,
	`schema_version` text NOT NULL,
	`methodology_version` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`diagnostic_id`) REFERENCES `diagnostics`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_results_run_unique` ON `analysis_results` (`analysis_run_id`);--> statement-breakpoint
CREATE INDEX `analysis_results_diagnostic_idx` ON `analysis_results` (`diagnostic_id`);--> statement-breakpoint
CREATE TABLE `analysis_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`diagnostic_id` text NOT NULL,
	`status` text DEFAULT 'scoring' NOT NULL,
	`schema_version` text NOT NULL,
	`methodology_version` text NOT NULL,
	`prompt_versions_json` text DEFAULT '{}' NOT NULL,
	`model_metadata_json` text DEFAULT '{}' NOT NULL,
	`error_code` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`diagnostic_id`) REFERENCES `diagnostics`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "analysis_runs_status_check" CHECK("analysis_runs"."status" in ('scoring','targeting','strategizing','money_now','resolving_tasks','writing_report','ready','failed'))
);
--> statement-breakpoint
CREATE INDEX `analysis_runs_diagnostic_idx` ON `analysis_runs` (`diagnostic_id`);--> statement-breakpoint
CREATE INDEX `analysis_runs_status_idx` ON `analysis_runs` (`status`);--> statement-breakpoint
CREATE TABLE `diagnostics` (
	`id` text PRIMARY KEY NOT NULL,
	`schema_version` text NOT NULL,
	`source_schema_version` text NOT NULL,
	`methodology_version` text NOT NULL,
	`raw_answers_json` text NOT NULL,
	`normalized_input_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `diagnostics_created_at_idx` ON `diagnostics` (`created_at`);