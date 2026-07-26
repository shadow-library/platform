CREATE TYPE "public"."organisation_member_status" AS ENUM('ACTIVE', 'SUSPENDED', 'BLOCKED');--> statement-breakpoint
ALTER TABLE "organisation_members" ADD COLUMN "status" "organisation_member_status" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "organisation_members" ADD COLUMN "status_reason" varchar(256);--> statement-breakpoint
ALTER TABLE "organisation_members" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organisation_members" ADD COLUMN "status_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_reason" varchar(256);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status_until" timestamp with time zone;