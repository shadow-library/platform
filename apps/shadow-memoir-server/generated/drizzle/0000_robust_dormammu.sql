CREATE TYPE "public"."auth_provider" AS ENUM('google', 'apple');--> statement-breakpoint
CREATE TYPE "public"."deletion_state" AS ENUM('none', 'pending', 'blobs_deleted', 'data_deleted', 'identity_closed', 'done');--> statement-breakpoint
CREATE TYPE "public"."intensity_mode" AS ENUM('standard', 'low_intensity', 'high_intensity');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."warmth_state" AS ENUM('cold', 'steady', 'warm');--> statement-breakpoint
CREATE TYPE "public"."command_status" AS ENUM('applied', 'rejected', 'superseded');--> statement-breakpoint
CREATE SEQUENCE "public"."sync_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"identity_sub" varchar(128) NOT NULL,
	"email" varchar(320),
	"display_name" varchar(200),
	"photo_url" text,
	"auth_provider" "auth_provider" NOT NULL,
	"default_currency" char(3) NOT NULL,
	"enabled_currencies" char(3)[] NOT NULL,
	"timezone" text NOT NULL,
	"schedule_start_min" smallint DEFAULT 360 NOT NULL,
	"schedule_end_min" smallint DEFAULT 1380 NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"week_start" smallint DEFAULT 1 NOT NULL,
	"intensity_mode" "intensity_mode" DEFAULT 'standard' NOT NULL,
	"returner_threshold_days" integer DEFAULT 7 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"total_xp" bigint DEFAULT 0 NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"stat_discipline" integer DEFAULT 0 NOT NULL,
	"stat_body" integer DEFAULT 0 NOT NULL,
	"stat_wealth" integer DEFAULT 0 NOT NULL,
	"stat_mind" integer DEFAULT 0 NOT NULL,
	"hp_today" smallint DEFAULT 0 NOT NULL,
	"hp_start_today" smallint DEFAULT 0 NOT NULL,
	"hp_max" smallint DEFAULT 0 NOT NULL,
	"last_hp_date" date,
	"last_active_date" date,
	"capacity_baseline" smallint,
	"warmth_state" "warmth_state" DEFAULT 'cold' NOT NULL,
	"crown_period_start" date,
	"crown_remaining" integer,
	"crown_coins_remaining" integer,
	"displayed_title_id" varchar(64),
	"feature_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ocr_quota_date" date,
	"ocr_quota_count" smallint DEFAULT 0 NOT NULL,
	"notification_prefs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"deletion_state" "deletion_state" DEFAULT 'none' NOT NULL,
	"deletion_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_identity_sub_unique" UNIQUE("identity_sub"),
	CONSTRAINT "accounts_level_check" CHECK ("accounts"."level" >= 1),
	CONSTRAINT "accounts_total_xp_check" CHECK ("accounts"."total_xp" >= 0),
	CONSTRAINT "accounts_coins_check" CHECK ("accounts"."coins" >= 0),
	CONSTRAINT "accounts_stat_discipline_check" CHECK ("accounts"."stat_discipline" >= 0),
	CONSTRAINT "accounts_stat_body_check" CHECK ("accounts"."stat_body" >= 0),
	CONSTRAINT "accounts_stat_wealth_check" CHECK ("accounts"."stat_wealth" >= 0),
	CONSTRAINT "accounts_stat_mind_check" CHECK ("accounts"."stat_mind" >= 0),
	CONSTRAINT "accounts_ocr_quota_count_check" CHECK ("accounts"."ocr_quota_count" >= 0),
	CONSTRAINT "accounts_schedule_start_min_check" CHECK ("accounts"."schedule_start_min" BETWEEN 0 AND 1439),
	CONSTRAINT "accounts_schedule_end_min_check" CHECK ("accounts"."schedule_end_min" BETWEEN 0 AND 1439),
	CONSTRAINT "accounts_week_start_check" CHECK ("accounts"."week_start" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"user_agent" varchar(300),
	"push_subscription" jsonb,
	"push_opt_in" boolean DEFAULT false NOT NULL,
	"reminder_prefs" jsonb,
	"last_seen_at" timestamp with time zone,
	"last_sync_seq" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "command_log" (
	"account_id" bigint NOT NULL,
	"command_id" uuid NOT NULL,
	"type" varchar(64) NOT NULL,
	"status" "command_status" NOT NULL,
	"result" jsonb,
	"device_id" uuid,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "command_log_account_id_command_id_pk" PRIMARY KEY("account_id","command_id")
);
--> statement-breakpoint
CREATE TABLE "deleted_records" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"table_name" varchar(64) NOT NULL,
	"record_id" varchar(64) NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_log" ADD CONSTRAINT "command_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_log" ADD CONSTRAINT "command_log_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_records" ADD CONSTRAINT "deleted_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_account_id_idx" ON "devices" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "command_log_applied_at_idx" ON "command_log" USING btree ("applied_at");--> statement-breakpoint
CREATE INDEX "deleted_records_account_id_sync_seq_idx" ON "deleted_records" USING btree ("account_id","sync_seq");