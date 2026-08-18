PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_analysis_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`diagnostic_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`schema_version` text NOT NULL,
	`methodology_version` text NOT NULL,
	`prompt_versions_json` text DEFAULT '{}' NOT NULL,
	`model_metadata_json` text DEFAULT '{}' NOT NULL,
	`error_code` text,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`diagnostic_id`) REFERENCES `diagnostics`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "analysis_runs_status_check" CHECK("__new_analysis_runs"."status" in ('draft','queued','scoring','targeting','strategizing','money_now','resolving_tasks','writing_report','ready','analysis_failed'))
);
--> statement-breakpoint
INSERT INTO `__new_analysis_runs`("id", "diagnostic_id", "status", "schema_version", "methodology_version", "prompt_versions_json", "model_metadata_json", "error_code", "error_message", "created_at", "updated_at") SELECT "id", "diagnostic_id", CASE WHEN "status" = 'failed' THEN 'analysis_failed' ELSE "status" END, "schema_version", "methodology_version", "prompt_versions_json", "model_metadata_json", "error_code", "error_message", "created_at", "updated_at" FROM `analysis_runs`;--> statement-breakpoint
DROP TABLE `analysis_runs`;--> statement-breakpoint
ALTER TABLE `__new_analysis_runs` RENAME TO `analysis_runs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `analysis_runs_diagnostic_idx` ON `analysis_runs` (`diagnostic_id`);--> statement-breakpoint
CREATE INDEX `analysis_runs_status_idx` ON `analysis_runs` (`status`);
