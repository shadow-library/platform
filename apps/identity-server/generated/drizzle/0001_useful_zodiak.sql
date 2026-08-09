CREATE TYPE "public"."identity_provider_kind" AS ENUM('OIDC', 'GOOGLE', 'MICROSOFT');--> statement-breakpoint
CREATE TABLE "auth_mode_settings" (
	"method" varchar(64) PRIMARY KEY NOT NULL,
	"is_enabled" boolean NOT NULL,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "identity_providers" DROP CONSTRAINT "identity_providers_organisation_id_unique";--> statement-breakpoint
ALTER TABLE "identity_providers" ALTER COLUMN "organisation_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_providers" ADD COLUMN "kind" "identity_provider_kind" DEFAULT 'OIDC' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_providers" ADD COLUMN "allow_sign_up" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_providers_organisation_unique" ON "identity_providers" USING btree ("organisation_id") WHERE "identity_providers"."organisation_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "identity_providers_global_kind_unique" ON "identity_providers" USING btree ("kind") WHERE "identity_providers"."organisation_id" is null;