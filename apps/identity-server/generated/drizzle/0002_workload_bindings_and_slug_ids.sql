ALTER TABLE "service_route_access" DROP CONSTRAINT "service_route_access_caller_client_id_oauth_clients_id_fk";--> statement-breakpoint
ALTER TABLE "oauth_client_redirect_uris" DROP CONSTRAINT "oauth_client_redirect_uris_client_id_oauth_clients_id_fk";--> statement-breakpoint
ALTER TABLE "oauth_client_scope_grants" DROP CONSTRAINT "oauth_client_scope_grants_client_id_oauth_clients_id_fk";--> statement-breakpoint
ALTER TABLE "oauth_client_secrets" DROP CONSTRAINT "oauth_client_secrets_client_id_oauth_clients_id_fk";--> statement-breakpoint
ALTER TABLE "oidc_logout_deliveries" DROP CONSTRAINT "oidc_logout_deliveries_client_id_oauth_clients_id_fk";--> statement-breakpoint
ALTER TABLE "oauth_clients" ALTER COLUMN "id" SET DATA TYPE varchar(64) USING "id"::text;--> statement-breakpoint
ALTER TABLE "oauth_clients" ALTER COLUMN "id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "service_route_access" ALTER COLUMN "caller_client_id" SET DATA TYPE varchar(64) USING "caller_client_id"::text;--> statement-breakpoint
ALTER TABLE "consents" ALTER COLUMN "client_id" SET DATA TYPE varchar(64) USING "client_id"::text;--> statement-breakpoint
ALTER TABLE "oauth_client_redirect_uris" ALTER COLUMN "client_id" SET DATA TYPE varchar(64) USING "client_id"::text;--> statement-breakpoint
ALTER TABLE "oauth_client_scope_grants" ALTER COLUMN "client_id" SET DATA TYPE varchar(64) USING "client_id"::text;--> statement-breakpoint
ALTER TABLE "oauth_client_secrets" ALTER COLUMN "client_id" SET DATA TYPE varchar(64) USING "client_id"::text;--> statement-breakpoint
ALTER TABLE "oidc_logout_deliveries" ALTER COLUMN "client_id" SET DATA TYPE varchar(64) USING "client_id"::text;--> statement-breakpoint
ALTER TABLE "refresh_token_families" ALTER COLUMN "client_id" SET DATA TYPE varchar(64) USING "client_id"::text;--> statement-breakpoint
ALTER TABLE "service_route_access" ADD CONSTRAINT "service_route_access_caller_client_id_oauth_clients_id_fk" FOREIGN KEY ("caller_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_redirect_uris" ADD CONSTRAINT "oauth_client_redirect_uris_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_scope_grants" ADD CONSTRAINT "oauth_client_scope_grants_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_secrets" ADD CONSTRAINT "oauth_client_secrets_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_logout_deliveries" ADD CONSTRAINT "oidc_logout_deliveries_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD COLUMN "workload_subjects" text[];--> statement-breakpoint
UPDATE "oauth_clients" SET "workload_subjects" = ARRAY["workload_subject"] WHERE "workload_subject" IS NOT NULL;
