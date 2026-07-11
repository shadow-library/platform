CREATE TYPE "public"."challenge_type" AS ENUM('EMAIL_OTP', 'SMS_OTP', 'EMAIL_LINK');--> statement-breakpoint
CREATE TABLE "verification_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint,
	"flow_id" varchar(128),
	"type" "challenge_type" NOT NULL,
	"target" varchar(255) NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "verification_challenges_flow_id_idx" ON "verification_challenges" USING btree ("flow_id");--> statement-breakpoint
CREATE INDEX "verification_challenges_target_created_at_idx" ON "verification_challenges" USING btree ("target","created_at");