CREATE TYPE "public"."session_aal" AS ENUM('AAL1', 'AAL2');--> statement-breakpoint
ALTER TYPE "public"."session_status" ADD VALUE 'EXPIRED';--> statement-breakpoint
CREATE TABLE "devices" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint NOT NULL,
	"fingerprint_hash" varchar(64) NOT NULL,
	"name" varchar(255),
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"trusted_at" timestamp with time zone,
	CONSTRAINT "devices_user_id_fingerprint_unique" UNIQUE("user_id","fingerprint_hash")
);
--> statement-breakpoint
ALTER TABLE "user_sessions" DROP CONSTRAINT "user_sessions_user_sign_in_event_id_user_sign_in_events_id_fk";
--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "user_sign_in_event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "expires_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "terminated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "last_used_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "last_used_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user_sessions" ALTER COLUMN "elevated_until" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "session_hash" varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "device_id" bigint;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "aal" "session_aal" DEFAULT 'AAL1' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "ip_address" varchar(45);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "ip_country" varchar(2);--> statement-breakpoint
ALTER TABLE "user_sessions" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_sign_in_event_id_user_sign_in_events_id_fk" FOREIGN KEY ("user_sign_in_event_id") REFERENCES "public"."user_sign_in_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_session_hash_unique" UNIQUE("session_hash");