CREATE TYPE "public"."app_session_status" AS ENUM('ACTIVE', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "app_session_elevations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"app_session_id" bigint NOT NULL,
	"audience" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_session_elevations_session_audience_unique" UNIQUE("app_session_id","audience")
);
--> statement-breakpoint
CREATE TABLE "app_sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_hash" varchar(64) NOT NULL,
	"client_id" varchar(64) NOT NULL,
	"identity_session_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"organisation_id" bigint,
	"granted_scope" text DEFAULT '' NOT NULL,
	"status" "app_session_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"terminated_at" timestamp with time zone,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_sessions_session_hash_unique" UNIQUE("session_hash")
);
--> statement-breakpoint
ALTER TABLE "app_session_elevations" ADD CONSTRAINT "app_session_elevations_app_session_id_app_sessions_id_fk" FOREIGN KEY ("app_session_id") REFERENCES "public"."app_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_sessions" ADD CONSTRAINT "app_sessions_client_id_oauth_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_sessions" ADD CONSTRAINT "app_sessions_identity_session_id_user_sessions_id_fk" FOREIGN KEY ("identity_session_id") REFERENCES "public"."user_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_sessions" ADD CONSTRAINT "app_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_sessions_identity_session_idx" ON "app_sessions" USING btree ("identity_session_id");--> statement-breakpoint
CREATE INDEX "app_sessions_client_user_idx" ON "app_sessions" USING btree ("client_id","user_id");