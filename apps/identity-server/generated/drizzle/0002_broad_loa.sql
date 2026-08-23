ALTER TYPE "public"."identity_provider_kind" ADD VALUE 'APPLE';--> statement-breakpoint
ALTER TABLE "identity_providers" ADD COLUMN "apple_team_id" varchar(64);--> statement-breakpoint
ALTER TABLE "identity_providers" ADD COLUMN "apple_key_id" varchar(64);