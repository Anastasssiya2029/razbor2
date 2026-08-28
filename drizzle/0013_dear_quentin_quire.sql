CREATE TABLE `analysis_sheet_syncs` (
	`analysis_run_id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`synced_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE cascade ON DELETE cascade,
	CONSTRAINT "analysis_sheet_syncs_status_check" CHECK("analysis_sheet_syncs"."status" in ('pending','synced','failed','not_configured'))
);
--> statement-breakpoint
CREATE INDEX `analysis_sheet_syncs_status_idx` ON `analysis_sheet_syncs` (`status`);