CREATE TYPE "public"."user_lock_mode" AS ENUM('NONE', 'OTP_ONLY', 'FULL');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "lock_mode" "user_lock_mode" DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locked_until" timestamp with time zone;