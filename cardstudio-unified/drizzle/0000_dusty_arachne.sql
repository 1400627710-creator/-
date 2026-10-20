CREATE TABLE `import_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`base_revision` integer NOT NULL,
	`blob_key` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`result_revision` integer
);
--> statement-breakpoint
CREATE INDEX `drafts_owner_project` ON `import_drafts` (`owner_id`,`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`blob_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `projects_owner` ON `projects` (`owner_id`);--> statement-breakpoint
CREATE TABLE `mutation_requests` (
	`project_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`request_id` text NOT NULL,
	`hash` text NOT NULL,
	`revision` integer NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `request_id`)
);
--> statement-breakpoint
CREATE TABLE `project_revisions` (
	`project_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer NOT NULL,
	`blob_key` text NOT NULL,
	`label` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`project_id`, `revision`)
);
