CREATE TYPE "public"."owner_kind" AS ENUM('user', 'bot');--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "owner_kind" "owner_kind" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "organisation_id" bigint;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "shared_with_org" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "illustrations" ADD COLUMN "owner_kind" "owner_kind" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" ADD COLUMN "owner_kind" "owner_kind" DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_settings" DROP CONSTRAINT "account_settings_pkey";--> statement-breakpoint
ALTER TABLE "account_settings" ADD CONSTRAINT "account_settings_owner_kind_owner_id_pk" PRIMARY KEY("owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "projects_owner_kind_owner_id_idx" ON "projects" USING btree ("owner_kind","owner_id");--> statement-breakpoint
CREATE INDEX "illustrations_owner_kind_owner_id_idx" ON "illustrations" USING btree ("owner_kind","owner_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_bot_owner_organisation_check" CHECK ("projects"."owner_kind" <> 'bot' OR "projects"."organisation_id" IS NOT NULL);
