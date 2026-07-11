CREATE TYPE "public"."webhook_delivery_status" AS ENUM('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD');--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subscription_id" bigint NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" varchar(128) NOT NULL,
	"payload" text NOT NULL,
	"status" "webhook_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" varchar(512),
	"response_status" integer,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(128) NOT NULL,
	"target_url" text NOT NULL,
	"event_types" text[] NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"kek_version" integer NOT NULL,
	"previous_secret_ciphertext" text,
	"previous_secret_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_subscription_id_webhook_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."webhook_subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_deliveries_subscription_event_unique" ON "webhook_deliveries" USING btree ("subscription_id","event_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_claim_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at");