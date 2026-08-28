CREATE TABLE `clients` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`niche` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `app_users`(`id`) ON UPDATE cascade ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `clients_owner_created_idx` ON `clients` (`created_by_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `clients_name_idx` ON `clients` (`display_name`);--> statement-breakpoint
ALTER TABLE `diagnostics` ADD `client_id` text REFERENCES clients(id);--> statement-breakpoint
ALTER TABLE `diagnostics` ADD `owner_user_id` text REFERENCES app_users(id);--> statement-breakpoint
ALTER TABLE `diagnostics` ADD `updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
CREATE INDEX `diagnostics_owner_created_idx` ON `diagnostics` (`owner_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `diagnostics_client_idx` ON `diagnostics` (`client_id`);