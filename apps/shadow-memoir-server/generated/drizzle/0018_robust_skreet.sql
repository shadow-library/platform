CREATE TYPE "public"."notification_category" AS ENUM('ai_result_ready', 'billing_reminder', 'weekly_digest');--> statement-breakpoint
CREATE TYPE "public"."notification_outbox_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"category" "notification_category" NOT NULL,
	"template_key" varchar(64) NOT NULL,
	"dedupe_key" varchar(200) NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "notification_outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notification_outbox_account_id_category_dedupe_key_unique" UNIQUE("account_id","category","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_outbox_status_next_attempt_at_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");