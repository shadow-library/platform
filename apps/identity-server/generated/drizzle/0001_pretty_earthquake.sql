CREATE TYPE "public"."scope_principal_type" AS ENUM('USER', 'SERVICE', 'BOTH');--> statement-breakpoint
ALTER TABLE "scopes" ADD COLUMN "principal_type" "scope_principal_type" DEFAULT 'BOTH' NOT NULL;