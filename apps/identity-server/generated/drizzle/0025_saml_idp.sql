CREATE TYPE "public"."signing_key_purpose" AS ENUM('OIDC', 'SAML');--> statement-breakpoint
CREATE TYPE "public"."saml_name_id_format" AS ENUM('EMAIL', 'PERSISTENT');--> statement-breakpoint
ALTER TYPE "public"."signing_key_algorithm" ADD VALUE 'RS256';--> statement-breakpoint
CREATE TABLE "saml_service_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_id" text NOT NULL,
	"name" varchar(255) NOT NULL,
	"acs_url" text NOT NULL,
	"name_id_format" "saml_name_id_format" DEFAULT 'EMAIL' NOT NULL,
	"released_attributes" text[] NOT NULL,
	"sp_certificate_pem" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saml_service_providers_entity_id_unique" UNIQUE("entity_id")
);
--> statement-breakpoint
DROP INDEX "signing_keys_single_active_idx";--> statement-breakpoint
ALTER TABLE "signing_keys" ADD COLUMN "purpose" "signing_key_purpose" DEFAULT 'OIDC' NOT NULL;--> statement-breakpoint
ALTER TABLE "signing_keys" ADD COLUMN "certificate_pem" text;--> statement-breakpoint
CREATE UNIQUE INDEX "signing_keys_single_active_idx" ON "signing_keys" USING btree ("purpose") WHERE status = 'ACTIVE';