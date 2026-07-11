ALTER TABLE "refresh_token_families" ADD COLUMN "scope" text;--> statement-breakpoint
ALTER TABLE "refresh_token_families" ADD COLUMN "audience" varchar(255);--> statement-breakpoint
ALTER TABLE "refresh_token_families" ADD COLUMN "organisation_id" bigint;