CREATE TYPE "public"."logout_delivery_status" AS ENUM('PENDING', 'SENDING', 'SENT', 'FAILED', 'DEAD');--> statement-breakpoint
CREATE TABLE "oidc_logout_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"logout_uri" text NOT NULL,
	"subject" varchar(64) NOT NULL,
	"sid" varchar(64) NOT NULL,
	"status" "logout_delivery_status" DEFAULT 'PENDING' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "backchannel_logout_uri" text;--> statement-breakpoint
ALTER TABLE "oidc_logout_deliveries" ADD CONSTRAINT "oidc_logout_deliveries_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oidc_logout_deliveries_claim_idx" ON "oidc_logout_deliveries" USING btree ("status","next_attempt_at");