CREATE TYPE "public"."audit_actor_type" AS ENUM('USER', 'SERVICE_ACCOUNT', 'SYSTEM', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."audit_outcome" AS ENUM('SUCCESS', 'DENIED', 'FAILURE');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"organisation_id" uuid,
	"actor_type" "audit_actor_type" NOT NULL,
	"actor_id" varchar(64),
	"action" varchar(128) NOT NULL,
	"target_type" varchar(64),
	"target_id" varchar(64),
	"outcome" "audit_outcome" NOT NULL,
	"ip_address" varchar(45),
	"correlation_id" varchar(64),
	"detail" jsonb,
	"prev_hash" text,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_events_organisation_id_id_idx" ON "audit_events" USING btree ("organisation_id","id");--> statement-breakpoint
CREATE INDEX "audit_events_action_id_idx" ON "audit_events" USING btree ("action","id");