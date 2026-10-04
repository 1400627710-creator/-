CREATE TABLE `counters` (
	`id` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mutation_guards` (
	`id` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "guard_must_pass" CHECK("mutation_guards"."valid"=1)
);
--> statement-breakpoint
CREATE TABLE `pairing` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`state` text NOT NULL,
	`actor_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name_key` text NOT NULL,
	`name` text NOT NULL,
	`payload` text NOT NULL,
	`blob_key` text,
	`hash` text NOT NULL,
	`revision` integer NOT NULL,
	`author` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_kind_name` ON `records` (`kind`,`name_key`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`payload` text NOT NULL,
	`blob_key` text,
	`hash` text NOT NULL,
	`actor_id` text NOT NULL,
	`author` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`decided_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submission_dedup` ON `submissions` (`kind`,`hash`,`actor_id`);--> statement-breakpoint
CREATE TABLE `versions` (
	`id` text PRIMARY KEY NOT NULL,
	`record_id` text NOT NULL,
	`revision` integer NOT NULL,
	`payload` text NOT NULL,
	`blob_key` text,
	`hash` text NOT NULL,
	`updated_at` text NOT NULL
);
