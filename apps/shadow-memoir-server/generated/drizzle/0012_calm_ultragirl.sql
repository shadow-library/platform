CREATE TYPE "public"."entitlement_state" AS ENUM('free', 'trial', 'active', 'grace', 'lapsed');--> statement-breakpoint
CREATE TYPE "public"."entitlement_tier" AS ENUM('free', 'paid');--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_event_id" varchar(200) NOT NULL,
	"account_id" bigint,
	"type" varchar(64) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"quarantined" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"account_id" bigint PRIMARY KEY NOT NULL,
	"tier" "entitlement_tier" DEFAULT 'free' NOT NULL,
	"state" "entitlement_state" DEFAULT 'free' NOT NULL,
	"expires_at" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"provider" varchar(32),
	"provider_ref" varchar(200),
	"trial_used" boolean DEFAULT false NOT NULL,
	"applied_event_at" timestamp with time zone,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "purchase_token" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_events_quarantined_received_at_idx" ON "billing_events" USING btree ("quarantined","received_at");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_purchase_token_unique" UNIQUE("purchase_token");