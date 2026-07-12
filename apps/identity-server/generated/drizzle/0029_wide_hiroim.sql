DROP TABLE "application_keys" CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_clients" ALTER COLUMN "token_endpoint_auth_method" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."token_endpoint_auth_method";--> statement-breakpoint
CREATE TYPE "public"."token_endpoint_auth_method" AS ENUM('client_secret_basic', 'none');--> statement-breakpoint
ALTER TABLE "oauth_clients" ALTER COLUMN "token_endpoint_auth_method" SET DATA TYPE "public"."token_endpoint_auth_method" USING "token_endpoint_auth_method"::"public"."token_endpoint_auth_method";--> statement-breakpoint
DROP TYPE "public"."public_key_algorithm";