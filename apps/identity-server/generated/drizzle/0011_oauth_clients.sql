CREATE TYPE "public"."oauth_client_kind" AS ENUM('WEB_CONFIDENTIAL', 'SPA_PUBLIC', 'NATIVE_PUBLIC', 'SERVICE');--> statement-breakpoint
CREATE TYPE "public"."token_endpoint_auth_method" AS ENUM('client_secret_basic', 'private_key_jwt', 'none');--> statement-breakpoint
CREATE TABLE "api_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" integer NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"display_name" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_resources_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
CREATE TABLE "oauth_client_redirect_uris" (
	"client_id" uuid NOT NULL,
	"uri" text NOT NULL,
	CONSTRAINT "oauth_client_redirect_uris_client_id_uri_pk" PRIMARY KEY("client_id","uri")
);
--> statement-breakpoint
CREATE TABLE "oauth_client_scope_grants" (
	"client_id" uuid NOT NULL,
	"scope_id" uuid NOT NULL,
	CONSTRAINT "oauth_client_scope_grants_client_id_scope_id_pk" PRIMARY KEY("client_id","scope_id")
);
--> statement-breakpoint
CREATE TABLE "oauth_client_secrets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"secret_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"kind" "oauth_client_kind" NOT NULL,
	"is_first_party" boolean DEFAULT false NOT NULL,
	"token_endpoint_auth_method" "token_endpoint_auth_method" NOT NULL,
	"grant_types" text[] NOT NULL,
	"require_pkce" boolean DEFAULT true NOT NULL,
	"access_token_ttl" integer DEFAULT 600 NOT NULL,
	"refresh_token_ttl" integer,
	"organisation_id" bigint,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"api_resource_id" uuid NOT NULL,
	"name" varchar(128) NOT NULL,
	"description" text,
	"is_sensitive" boolean DEFAULT false NOT NULL,
	CONSTRAINT "scopes_resource_name_unique" UNIQUE("api_resource_id","name")
);
--> statement-breakpoint
ALTER TABLE "api_resources" ADD CONSTRAINT "api_resources_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_redirect_uris" ADD CONSTRAINT "oauth_client_redirect_uris_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_scope_grants" ADD CONSTRAINT "oauth_client_scope_grants_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_scope_grants" ADD CONSTRAINT "oauth_client_scope_grants_scope_id_scopes_id_fk" FOREIGN KEY ("scope_id") REFERENCES "public"."scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_secrets" ADD CONSTRAINT "oauth_client_secrets_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_clients" ADD CONSTRAINT "oauth_clients_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scopes" ADD CONSTRAINT "scopes_api_resource_id_api_resources_id_fk" FOREIGN KEY ("api_resource_id") REFERENCES "public"."api_resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_client_secrets_client_id_idx" ON "oauth_client_secrets" USING btree ("client_id");