CREATE TYPE "public"."bot_ownership_transfer_status" AS ENUM('PENDING', 'DONE', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."bot_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DELETING', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."bot_grant_level" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TABLE "bot_keys" (
	"id" uuid PRIMARY KEY NOT NULL,
	"bot_id" bigint NOT NULL,
	"name" varchar(64) NOT NULL,
	"key_prefix" varchar(16) NOT NULL,
	"secret_hash" char(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"last_used_ip" "inet",
	"expiry_reminded_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" bigint,
	CONSTRAINT "bot_keys_secret_hash_unique" UNIQUE("secret_hash"),
	CONSTRAINT "bot_keys_expiry_within_365_days" CHECK ("bot_keys"."expires_at" <= "bot_keys"."created_at" + interval '365 days')
);
--> statement-breakpoint
CREATE TABLE "bot_ownership_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_id" bigint NOT NULL,
	"application_id" integer NOT NULL,
	"to_user_id" bigint NOT NULL,
	"status" "bot_ownership_transfer_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "bot_ownership_transfers_bot_application_unique" UNIQUE("bot_id","application_id")
);
--> statement-breakpoint
CREATE TABLE "bots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"organisation_id" bigint NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"handle" varchar(39) NOT NULL,
	"display_name" varchar(64) NOT NULL,
	"description" varchar(280),
	"status" "bot_status" DEFAULT 'ACTIVE' NOT NULL,
	"ip_allowlist" "cidr"[] DEFAULT '{}'::cidr[] NOT NULL,
	"rate_limit_per_minute" integer DEFAULT 600 NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspended_by" bigint,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "bots_client_id_unique" UNIQUE("client_id"),
	CONSTRAINT "bots_rate_limit_range" CHECK ("bots"."rate_limit_per_minute" BETWEEN 1 AND 600)
);
--> statement-breakpoint
ALTER TABLE "application_roles" ADD COLUMN "bot_grantable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "application_roles" ADD COLUMN "bot_resource" varchar(64);--> statement-breakpoint
ALTER TABLE "application_roles" ADD COLUMN "bot_level" "bot_grant_level";--> statement-breakpoint
ALTER TABLE "application_roles" ADD COLUMN "is_sensitive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "bot_keys" ADD CONSTRAINT "bot_keys_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_keys" ADD CONSTRAINT "bot_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_keys" ADD CONSTRAINT "bot_keys_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_ownership_transfers" ADD CONSTRAINT "bot_ownership_transfers_bot_id_bots_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."bots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_ownership_transfers" ADD CONSTRAINT "bot_ownership_transfers_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_ownership_transfers" ADD CONSTRAINT "bot_ownership_transfers_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "public"."organisations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bots" ADD CONSTRAINT "bots_suspended_by_users_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bot_keys_active_bot_id_idx" ON "bot_keys" USING btree ("bot_id") WHERE "bot_keys"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "bot_ownership_transfers_claim_idx" ON "bot_ownership_transfers" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "bots_organisation_handle_unique" ON "bots" USING btree ("organisation_id","handle");