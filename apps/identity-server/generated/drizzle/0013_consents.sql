CREATE TYPE "public"."consent_source" AS ENUM('USER', 'FIRST_PARTY_POLICY', 'ADMIN');--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"client_id" uuid NOT NULL,
	"scope_names" text[] NOT NULL,
	"source" "consent_source" NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "consents_user_client_active_idx" ON "consents" USING btree ("user_id","client_id") WHERE revoked_at IS NULL;