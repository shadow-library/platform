CREATE TYPE "public"."refresh_family_status" AS ENUM('ACTIVE', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."refresh_revoke_reason" AS ENUM('ROTATION_REUSE', 'LOGOUT', 'ADMIN', 'EXPIRY');--> statement-breakpoint
CREATE TYPE "public"."refresh_token_status" AS ENUM('ACTIVE', 'ROTATED', 'REVOKED');--> statement-breakpoint
CREATE TABLE "refresh_token_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"session_id" bigint,
	"client_id" uuid,
	"status" "refresh_family_status" DEFAULT 'ACTIVE' NOT NULL,
	"revoke_reason" "refresh_revoke_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"status" "refresh_token_status" DEFAULT 'ACTIVE' NOT NULL,
	"previous_token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"rotated_at" timestamp with time zone,
	"ip_address" varchar(45),
	"ip_country" varchar(2),
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "refresh_token_families" ADD CONSTRAINT "refresh_token_families_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_token_families" ADD CONSTRAINT "refresh_token_families_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_family_id_refresh_token_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."refresh_token_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "refresh_token_families_user_id_status_idx" ON "refresh_token_families" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "refresh_token_families_session_id_idx" ON "refresh_token_families" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_family_active_idx" ON "refresh_tokens" USING btree ("family_id") WHERE status = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens" USING btree ("family_id");