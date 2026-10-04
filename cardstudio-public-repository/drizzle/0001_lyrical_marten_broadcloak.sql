CREATE TABLE `kadi_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`record_id` text,
	`detail` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kadi_counters` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kadi_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "kadi_guard_must_pass" CHECK("kadi_guards"."valid"=1)
);
--> statement-breakpoint
CREATE TABLE `kadi_records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`payload` text NOT NULL,
	`blob_key` text,
	`thumb_key` text,
	`hash` text NOT NULL,
	`revision` integer NOT NULL,
	`author` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kadi_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`permissions` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kadi_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `kadi_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`payload` text NOT NULL,
	`blob_key` text,
	`thumb_key` text,
	`target_id` text,
	`hash` text NOT NULL,
	`actor_id` text NOT NULL,
	`author` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer NOT NULL,
	`feedback` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kadi_submission_dedup` ON `kadi_submissions` (`kind`,`hash`,`actor_id`);--> statement-breakpoint
CREATE TABLE `kadi_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`blob_key` text,
	`thumb_key` text,
	`author` text NOT NULL,
	`updated_at` text NOT NULL
);
