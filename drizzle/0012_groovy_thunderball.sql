CREATE TABLE `analysis_gifts` (
	`id` text PRIMARY KEY NOT NULL,
	`analysis_run_id` text NOT NULL,
	`tariff` text NOT NULL,
	`prize_code` text NOT NULL,
	`prize_name` text NOT NULL,
	`selected_by_user_id` text NOT NULL,
	`selected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`analysis_run_id`) REFERENCES `analysis_runs`(`id`) ON UPDATE cascade ON DELETE restrict,
	FOREIGN KEY (`selected_by_user_id`) REFERENCES `app_users`(`id`) ON UPDATE cascade ON DELETE restrict,
	CONSTRAINT "analysis_gifts_tariff_check" CHECK("analysis_gifts"."tariff" in ('self','support'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `analysis_gifts_run_unique` ON `analysis_gifts` (`analysis_run_id`);--> statement-breakpoint
CREATE INDEX `analysis_gifts_selected_by_idx` ON `analysis_gifts` (`selected_by_user_id`);