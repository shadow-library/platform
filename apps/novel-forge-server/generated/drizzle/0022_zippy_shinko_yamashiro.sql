CREATE TYPE "public"."brief_write_mode" AS ENUM('standard', 'external');--> statement-breakpoint
ALTER TYPE "public"."draft_revision_source" ADD VALUE 'amended';--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "write_mode" "brief_write_mode" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "inserted_at" timestamp;