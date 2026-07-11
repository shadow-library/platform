CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD');--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"template_key" varchar(128) NOT NULL,
	"recipients" jsonb NOT NULL,
	"payload" jsonb,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "notification_outbox_status_next_attempt_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");