CREATE TYPE "public"."credential_action" AS ENUM('create', 'rotate', 'revoke');--> statement-breakpoint
CREATE TABLE "credential_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"credential_id" uuid NOT NULL,
	"action" "credential_action" NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"secret" jsonb NOT NULL,
	"allowed_origin" text NOT NULL,
	"hint" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rotated_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "provider_credentials_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "credential_events" ADD CONSTRAINT "credential_events_credential_id_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."provider_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credential_events_credential_id_idx" ON "credential_events" USING btree ("credential_id","at");--> statement-breakpoint
CREATE INDEX "provider_credentials_secret_kid_idx" ON "provider_credentials" USING btree (("secret"->>'kid'));