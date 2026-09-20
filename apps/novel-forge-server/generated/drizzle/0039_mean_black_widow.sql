ALTER TYPE "public"."job_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "cancel_requested_at" timestamp;