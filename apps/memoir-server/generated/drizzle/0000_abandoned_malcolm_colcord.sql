CREATE TYPE "public"."auth_provider" AS ENUM('google', 'apple');--> statement-breakpoint
CREATE TYPE "public"."deletion_state" AS ENUM('none', 'pending', 'blobs_deleted', 'data_deleted', 'identity_closed', 'done');--> statement-breakpoint
CREATE TYPE "public"."intensity_mode" AS ENUM('standard', 'low_intensity', 'high_intensity');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."warmth_state" AS ENUM('cold', 'steady', 'warm');--> statement-breakpoint
CREATE TYPE "public"."command_status" AS ENUM('applied', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."module_link" AS ENUM('journal', 'meal', 'weight');--> statement-breakpoint
CREATE TYPE "public"."partial_mode" AS ENUM('scaled', 'actual', 'none');--> statement-breakpoint
CREATE TYPE "public"."stat_affinity" AS ENUM('discipline', 'body', 'wealth', 'mind');--> statement-breakpoint
CREATE TYPE "public"."strictness" AS ENUM('anchor', 'routine', 'goal', 'recovery', 'optional');--> statement-breakpoint
CREATE TYPE "public"."quest_log_state" AS ENUM('completed', 'partial', 'skipped', 'missed', 'late', 'postponed', 'rescheduled', 'recovery');--> statement-breakpoint
CREATE TYPE "public"."reason_tag" AS ENUM('forgot', 'too_tired', 'task_too_big', 'schedule_conflict', 'avoided_it', 'emotional_resistance', 'health', 'travel', 'family_social', 'work_emergency', 'not_important_anymore', 'poorly_planned', 'other');--> statement-breakpoint
CREATE TYPE "public"."hero_event_type" AS ENUM('quest_complete', 'quest_partial', 'quest_late', 'recovery', 'level_up', 'achievement_unlock', 'coin_grant', 'crown_banked', 'side_quest', 'journal', 'meal', 'weight', 'coin_spend', 'recovery_spawned', 'recovery_completed', 'recovery_expired', 'crown_init', 'crown_forfeit', 'returner_fired');--> statement-breakpoint
CREATE TYPE "public"."momentum_bucket" AS ENUM('cold', 'steady', 'warm');--> statement-breakpoint
CREATE TYPE "public"."comeback_event_kind" AS ENUM('armed', 're_armed', 'fired', 're_fired');--> statement-breakpoint
CREATE TYPE "public"."comeback_trigger_kind" AS ENUM('anchor_miss_yesterday', 'miss_within_days');--> statement-breakpoint
CREATE TYPE "public"."recovery_quest_state" AS ENUM('pending', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."cosmetic_source" AS ENUM('coin', 'achievement');--> statement-breakpoint
CREATE TYPE "public"."expense_source" AS ENUM('manual', 'ocr');--> statement-breakpoint
CREATE TYPE "public"."reminder_lead" AS ENUM('on_day', '1_day', '2_day', '3_day', '1_week');--> statement-breakpoint
CREATE TYPE "public"."subscription_frequency" AS ENUM('weekly', 'monthly', 'quarterly', 'yearly', 'custom');--> statement-breakpoint
CREATE TYPE "public"."metric_direction" AS ENUM('higher', 'lower', 'range', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."metric_entry_source" AS ENUM('quest_log', 'manual', 'food');--> statement-breakpoint
CREATE TYPE "public"."metric_value_type" AS ENUM('number', 'duration', 'count', 'currency', 'boolean', 'text');--> statement-breakpoint
CREATE TYPE "public"."meal_type" AS ENUM('cooked', 'ate_out');--> statement-breakpoint
CREATE TYPE "public"."entitlement_state" AS ENUM('free', 'trial', 'active', 'grace', 'lapsed');--> statement-breakpoint
CREATE TYPE "public"."entitlement_tier" AS ENUM('free', 'paid');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('pending_upload', 'stored', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."ai_consent_data_class" AS ENUM('journal_reflection_reason', 'health');--> statement-breakpoint
CREATE TYPE "public"."ai_task_audit_action" AS ENUM('claimed', 'read_scope', 'finished', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."ai_task_kind" AS ENUM('adhoc', 'scheduled');--> statement-breakpoint
CREATE TYPE "public"."ai_task_status" AS ENUM('pending', 'running', 'done', 'failed', 'cancelled', 'held_upgrade');--> statement-breakpoint
CREATE TYPE "public"."export_job_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."notification_category" AS ENUM('ai_result_ready', 'billing_reminder', 'weekly_digest');--> statement-breakpoint
CREATE TYPE "public"."notification_outbox_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
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
	"pending_timezone" text,
	"schedule_start_min" smallint DEFAULT 360 NOT NULL,
	"schedule_end_min" smallint DEFAULT 1380 NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"week_start" smallint DEFAULT 1 NOT NULL,
	"intensity_mode" "intensity_mode" DEFAULT 'standard' NOT NULL,
	"pending_intensity_mode" "intensity_mode",
	"returner_threshold_days" integer DEFAULT 7 NOT NULL,
	"pending_returner_shields" smallint DEFAULT 0 NOT NULL,
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
	"purchase_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"deletion_state" "deletion_state" DEFAULT 'none' NOT NULL,
	"deletion_started_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_identity_sub_unique" UNIQUE("identity_sub"),
	CONSTRAINT "accounts_purchase_token_unique" UNIQUE("purchase_token"),
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
	CONSTRAINT "accounts_week_start_check" CHECK ("accounts"."week_start" BETWEEN 0 AND 6),
	CONSTRAINT "accounts_pending_returner_shields_check" CHECK ("accounts"."pending_returner_shields" >= 0)
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
CREATE TABLE "quest_consequences" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"quest_id" bigint NOT NULL,
	"metric_id" bigint NOT NULL,
	"full_value" numeric NOT NULL,
	"unit" text,
	"partial_mode" "partial_mode" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"name" varchar(200) NOT NULL,
	"notes" text,
	"start_time_min" smallint,
	"duration_min" smallint NOT NULL,
	"stat_affinity" "stat_affinity" NOT NULL,
	"strictness" "strictness" NOT NULL,
	"optional_streak_opt_in" boolean DEFAULT false NOT NULL,
	"recurrence" jsonb NOT NULL,
	"module_link" "module_link",
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"reminder_lead_min" smallint DEFAULT 0 NOT NULL,
	"health_threshold" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quests_start_time_min_check" CHECK ("quests"."start_time_min" BETWEEN 0 AND 1439),
	CONSTRAINT "quests_duration_min_check" CHECK ("quests"."duration_min" >= 0),
	CONSTRAINT "quests_reminder_lead_min_check" CHECK ("quests"."reminder_lead_min" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quest_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"quest_id" bigint NOT NULL,
	"date" date NOT NULL,
	"state" "quest_log_state" NOT NULL,
	"xp_awarded" smallint DEFAULT 0 NOT NULL,
	"coins_awarded" smallint DEFAULT 0 NOT NULL,
	"stat_affinity" "stat_affinity" NOT NULL,
	"strictness" "strictness" NOT NULL,
	"intensity_mode_at_log" "intensity_mode" NOT NULL,
	"crown_slice_weight" numeric(4, 2) NOT NULL,
	"ruleset_version" smallint NOT NULL,
	"reason_tag" "reason_tag",
	"reason_note" varchar(120),
	"reflection_text" text,
	"rescheduled_to_min" smallint,
	"postponed_to_date" date,
	"performed_at" timestamp with time zone,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quest_logs_account_id_quest_id_date_unique" UNIQUE("account_id","quest_id","date"),
	CONSTRAINT "quest_logs_xp_awarded_check" CHECK ("quest_logs"."xp_awarded" >= 0),
	CONSTRAINT "quest_logs_coins_awarded_check" CHECK ("quest_logs"."coins_awarded" >= 0),
	CONSTRAINT "quest_logs_rescheduled_to_min_check" CHECK ("quest_logs"."rescheduled_to_min" BETWEEN 0 AND 1439)
);
--> statement-breakpoint
CREATE TABLE "hero_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"dedupe_key" varchar(120) NOT NULL,
	"type" "hero_event_type" NOT NULL,
	"quest_id" bigint,
	"quest_log_id" bigint,
	"state" "quest_log_state",
	"xp_delta" smallint DEFAULT 0 NOT NULL,
	"coins_delta" smallint DEFAULT 0 NOT NULL,
	"stat_affinity" "stat_affinity",
	"stat_delta" smallint DEFAULT 0 NOT NULL,
	"level_after" smallint,
	"achievement_id" varchar(64),
	"date" date NOT NULL,
	"note" text,
	"ruleset_version" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hero_events_account_id_dedupe_key_unique" UNIQUE("account_id","dedupe_key"),
	CONSTRAINT "hero_events_xp_delta_check" CHECK ("hero_events"."xp_delta" >= 0),
	CONSTRAINT "hero_events_coins_delta_check" CHECK ("hero_events"."coins_delta" >= 0 OR "hero_events"."type" = 'coin_spend')
);
--> statement-breakpoint
CREATE TABLE "daily_states" (
	"account_id" bigint NOT NULL,
	"date" date NOT NULL,
	"intensity_mode" "intensity_mode" NOT NULL,
	"hp_start" smallint NOT NULL,
	"hp_end" smallint NOT NULL,
	"hp_max" smallint NOT NULL,
	"crown_xp_granted" integer DEFAULT 0 NOT NULL,
	"crown_xp_remaining" integer DEFAULT 0 NOT NULL,
	"crown_coins_granted" integer DEFAULT 0 NOT NULL,
	"crown_coins_remaining" integer DEFAULT 0 NOT NULL,
	"crown_period_start" date NOT NULL,
	"crown_banked_xp" integer,
	"crown_banked_coins" integer,
	"committed_at" timestamp with time zone,
	"locked_quest_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"lock_broken_at" timestamp with time zone,
	"comeback_armed" boolean DEFAULT false NOT NULL,
	"comeback_fired" boolean DEFAULT false NOT NULL,
	"comeback_fired_at" timestamp with time zone,
	"comeback_armed_via_recovery" boolean DEFAULT false NOT NULL,
	"comeback_re_fired" boolean DEFAULT false NOT NULL,
	"returner_active" boolean DEFAULT false NOT NULL,
	"returner_fired" boolean DEFAULT false NOT NULL,
	"momentum_bucket" "momentum_bucket" DEFAULT 'steady' NOT NULL,
	"missed_count" integer DEFAULT 0 NOT NULL,
	"rollover_at" timestamp with time zone,
	"rollover_engine_version" text,
	"ruleset_version" smallint NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "daily_states_account_id_date_pk" PRIMARY KEY("account_id","date"),
	CONSTRAINT "daily_states_missed_count_check" CHECK ("daily_states"."missed_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "comeback_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"date" date NOT NULL,
	"kind" "comeback_event_kind" NOT NULL,
	"trigger_kind" "comeback_trigger_kind",
	"source_quest_log_id" bigint,
	"consumed_quest_log_id" bigint,
	"xp_bonus" smallint DEFAULT 0 NOT NULL,
	"coin_bonus" smallint DEFAULT 0 NOT NULL,
	"intensity_mode" "intensity_mode" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comeback_events_account_id_date_kind_unique" UNIQUE("account_id","date","kind")
);
--> statement-breakpoint
CREATE TABLE "recovery_quests" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"date" date NOT NULL,
	"source_quest_id" bigint,
	"source_quest_name" varchar(200) NOT NULL,
	"trigger_log_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"state" "recovery_quest_state" DEFAULT 'pending' NOT NULL,
	"reflection_text" text,
	"is_returner_day" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_quests_account_id_date_unique" UNIQUE("account_id","date")
);
--> statement-breakpoint
CREATE TABLE "reschedule_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"quest_id" bigint NOT NULL,
	"date" date NOT NULL,
	"from_min" smallint,
	"to_min" smallint NOT NULL,
	"reason_tag" "reason_tag",
	"reason_note" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reschedule_events_account_id_quest_id_date_unique" UNIQUE("account_id","quest_id","date"),
	CONSTRAINT "reschedule_events_from_min_check" CHECK ("reschedule_events"."from_min" BETWEEN 0 AND 1439),
	CONSTRAINT "reschedule_events_to_min_check" CHECK ("reschedule_events"."to_min" BETWEEN 0 AND 1439)
);
--> statement-breakpoint
CREATE TABLE "returner_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"date" date NOT NULL,
	"return_date" date NOT NULL,
	"last_active_date" date,
	"days_absent" integer NOT NULL,
	"shield_target_quest_id" bigint,
	"shield_pending" boolean DEFAULT false NOT NULL,
	"intensity_mode" "intensity_mode" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "returner_events_account_id_date_unique" UNIQUE("account_id","date"),
	CONSTRAINT "returner_events_days_absent_check" CHECK ("returner_events"."days_absent" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shield_consumptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"quest_id" bigint NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shield_consumptions_account_id_quest_id_date_unique" UNIQUE("account_id","quest_id","date")
);
--> statement-breakpoint
CREATE TABLE "achievements_earned" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"achievement_id" varchar(64) NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_earned_account_id_achievement_id_unique" UNIQUE("account_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "cosmetic_unlocks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"cosmetic_id" varchar(64) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"source" "cosmetic_source" NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cosmetic_unlocks_account_id_cosmetic_id_unique" UNIQUE("account_id","cosmetic_id")
);
--> statement-breakpoint
CREATE TABLE "titles_earned" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"title_id" varchar(64) NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "titles_earned_account_id_title_id_unique" UNIQUE("account_id","title_id")
);
--> statement-breakpoint
CREATE TABLE "quest_streaks" (
	"account_id" bigint NOT NULL,
	"quest_id" bigint NOT NULL,
	"current_run_days" integer DEFAULT 0 NOT NULL,
	"run_start_date" date,
	"last_counted_date" date,
	"shields_available" smallint DEFAULT 0 NOT NULL,
	"completions_toward_shield" smallint DEFAULT 0 NOT NULL,
	"best_run_days" integer DEFAULT 0 NOT NULL,
	"pending_shield_grant" smallint DEFAULT 0 NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "quest_streaks_account_id_quest_id_pk" PRIMARY KEY("account_id","quest_id"),
	CONSTRAINT "quest_streaks_shields_available_check" CHECK ("quest_streaks"."shields_available" BETWEEN 0 AND 2),
	CONSTRAINT "quest_streaks_current_run_days_check" CHECK ("quest_streaks"."current_run_days" >= 0),
	CONSTRAINT "quest_streaks_best_run_days_check" CHECK ("quest_streaks"."best_run_days" >= 0),
	CONSTRAINT "quest_streaks_completions_toward_shield_check" CHECK ("quest_streaks"."completions_toward_shield" >= 0),
	CONSTRAINT "quest_streaks_pending_shield_grant_check" CHECK ("quest_streaks"."pending_shield_grant" >= 0)
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"key" varchar(32) NOT NULL,
	"label" varchar(64) NOT NULL,
	"builtin" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_account_id_key_unique" UNIQUE("account_id","key")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"amount_minor" bigint NOT NULL,
	"amount_text" varchar(40) NOT NULL,
	"currency" char(3) NOT NULL,
	"fx_rate" numeric(18, 8),
	"home_amount_minor" bigint,
	"fx_rate_date" date,
	"category_id" varchar(32) NOT NULL,
	"merchant" varchar(200),
	"note" text,
	"receipt_ref" varchar(200),
	"line_items" jsonb,
	"occurred_on" date NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "expense_source" DEFAULT 'manual' NOT NULL,
	"linked_quest_id" bigint,
	"linked_subscription_id" bigint,
	"billing_cycle_date" date,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"date" date NOT NULL,
	"base" char(3) NOT NULL,
	"quote" char(3) NOT NULL,
	"rate" numeric(18, 8),
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rates_date_base_quote_pk" PRIMARY KEY("date","base","quote")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"name" varchar(200) NOT NULL,
	"note" text,
	"amount_minor" bigint NOT NULL,
	"amount_text" varchar(40) NOT NULL,
	"currency" char(3) NOT NULL,
	"frequency" "subscription_frequency" NOT NULL,
	"custom_interval_days" smallint,
	"billing_day" smallint NOT NULL,
	"next_due_date" date NOT NULL,
	"last_confirmed_date" date,
	"category_id" varchar(32) NOT NULL,
	"reminder_enabled" boolean DEFAULT false NOT NULL,
	"reminder_lead" "reminder_lead" DEFAULT 'on_day' NOT NULL,
	"monthly_equivalent_minor" bigint NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_billing_day_check" CHECK ("subscriptions"."billing_day" BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE TABLE "metric_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"metric_id" bigint NOT NULL,
	"date" date NOT NULL,
	"value" numeric NOT NULL,
	"source" "metric_entry_source" DEFAULT 'manual' NOT NULL,
	"quest_log_id" bigint,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"name" varchar(100) NOT NULL,
	"unit" varchar(32),
	"value_type" "metric_value_type" NOT NULL,
	"direction" "metric_direction" NOT NULL,
	"default_value" numeric,
	"glyph" varchar(16),
	"builtin" boolean DEFAULT false NOT NULL,
	"is_health" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metrics_account_id_name_unique" UNIQUE("account_id","name")
);
--> statement-breakpoint
CREATE TABLE "progress_counters" (
	"account_id" bigint PRIMARY KEY NOT NULL,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"date" date NOT NULL,
	"text" text NOT NULL,
	"mood" smallint,
	"tags" text[],
	"rewarded" boolean DEFAULT false NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_mood_check" CHECK ("journal_entries"."mood" IS NULL OR "journal_entries"."mood" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "meal_presets" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"name" varchar(200) NOT NULL,
	"calories" integer NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_presets_calories_check" CHECK ("meal_presets"."calories" >= 0)
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"date" date NOT NULL,
	"name" varchar(200) NOT NULL,
	"calories" integer NOT NULL,
	"meal_type" "meal_type" NOT NULL,
	"note" text,
	"preset_id" bigint,
	"rewarded" boolean DEFAULT false NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meals_calories_check" CHECK ("meals"."calories" >= 0)
);
--> statement-breakpoint
CREATE TABLE "side_quests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"date" date NOT NULL,
	"name" varchar(200) NOT NULL,
	"stat_affinity" "stat_affinity",
	"xp_awarded" smallint DEFAULT 0 NOT NULL,
	"coins_awarded" smallint DEFAULT 0 NOT NULL,
	"stat_ticked" smallint DEFAULT 0 NOT NULL,
	"rewarded" boolean DEFAULT false NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weights" (
	"account_id" bigint NOT NULL,
	"date" date NOT NULL,
	"kg" numeric(5, 2) NOT NULL,
	"rewarded" boolean DEFAULT false NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weights_account_id_date_pk" PRIMARY KEY("account_id","date")
);
--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"provider" varchar(32) NOT NULL,
	"provider_event_id" varchar(200) NOT NULL,
	"account_id" bigint,
	"type" varchar(64) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"quarantined" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "entitlements" (
	"account_id" bigint PRIMARY KEY NOT NULL,
	"tier" "entitlement_tier" DEFAULT 'free' NOT NULL,
	"state" "entitlement_state" DEFAULT 'free' NOT NULL,
	"expires_at" timestamp with time zone,
	"grace_ends_at" timestamp with time zone,
	"provider" varchar(32),
	"provider_ref" varchar(200),
	"trial_used" boolean DEFAULT false NOT NULL,
	"applied_event_at" timestamp with time zone,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"ref" varchar(200) PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"status" "receipt_status" DEFAULT 'pending_upload' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_size_bytes_check" CHECK ("receipts"."size_bytes" > 0 AND "receipts"."size_bytes" <= 8388608)
);
--> statement-breakpoint
CREATE TABLE "ai_consents" (
	"account_id" bigint NOT NULL,
	"data_class" "ai_consent_data_class" NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "ai_consents_account_id_data_class_unique" UNIQUE("account_id","data_class")
);
--> statement-breakpoint
CREATE TABLE "ai_results" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"task_id" uuid NOT NULL,
	"answer" text NOT NULL,
	"patterns" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"limitation_note" text,
	"model_id" varchar(64) NOT NULL,
	"prompt_version" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "ai_results_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "ai_scheduled_queries" (
	"account_id" bigint PRIMARY KEY NOT NULL,
	"query_text" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_task_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"task_id" uuid NOT NULL,
	"action" "ai_task_audit_action" NOT NULL,
	"data_classes" text[],
	"row_counts" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"query_text" text NOT NULL,
	"status" "ai_task_status" DEFAULT 'pending' NOT NULL,
	"kind" "ai_task_kind" DEFAULT 'adhoc' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_by" timestamp with time zone NOT NULL,
	"quota_month" varchar(7),
	"quota_consumed" boolean DEFAULT false NOT NULL,
	"claimed_by" varchar(64),
	"claimed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" varchar(500),
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applied_suggestions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"result_id" bigint NOT NULL,
	"suggestion_index" smallint NOT NULL,
	"quest_id" bigint NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quest_snapshot_before" jsonb NOT NULL,
	CONSTRAINT "applied_suggestions_result_id_suggestion_index_unique" UNIQUE("result_id","suggestion_index")
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"status" "export_job_status" DEFAULT 'pending' NOT NULL,
	"object_key" varchar(200),
	"error" varchar(500),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"category" "notification_category" NOT NULL,
	"template_key" varchar(64) NOT NULL,
	"dedupe_key" varchar(200) NOT NULL,
	"variables" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "notification_outbox_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notification_outbox_account_id_category_dedupe_key_unique" UNIQUE("account_id","category","dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_log" ADD CONSTRAINT "command_log_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_log" ADD CONSTRAINT "command_log_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_records" ADD CONSTRAINT "deleted_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_consequences" ADD CONSTRAINT "quest_consequences_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_consequences" ADD CONSTRAINT "quest_consequences_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_consequences" ADD CONSTRAINT "quest_consequences_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quests" ADD CONSTRAINT "quests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_logs" ADD CONSTRAINT "quest_logs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_logs" ADD CONSTRAINT "quest_logs_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hero_events" ADD CONSTRAINT "hero_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_states" ADD CONSTRAINT "daily_states_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comeback_events" ADD CONSTRAINT "comeback_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_quests" ADD CONSTRAINT "recovery_quests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_quests" ADD CONSTRAINT "recovery_quests_source_quest_id_quests_id_fk" FOREIGN KEY ("source_quest_id") REFERENCES "public"."quests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reschedule_events" ADD CONSTRAINT "reschedule_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reschedule_events" ADD CONSTRAINT "reschedule_events_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returner_events" ADD CONSTRAINT "returner_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returner_events" ADD CONSTRAINT "returner_events_shield_target_quest_id_quests_id_fk" FOREIGN KEY ("shield_target_quest_id") REFERENCES "public"."quests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shield_consumptions" ADD CONSTRAINT "shield_consumptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shield_consumptions" ADD CONSTRAINT "shield_consumptions_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements_earned" ADD CONSTRAINT "achievements_earned_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cosmetic_unlocks" ADD CONSTRAINT "cosmetic_unlocks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "titles_earned" ADD CONSTRAINT "titles_earned_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_streaks" ADD CONSTRAINT "quest_streaks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_streaks" ADD CONSTRAINT "quest_streaks_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_linked_subscription_id_subscriptions_id_fk" FOREIGN KEY ("linked_subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_entries" ADD CONSTRAINT "metric_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_entries" ADD CONSTRAINT "metric_entries_metric_id_metrics_id_fk" FOREIGN KEY ("metric_id") REFERENCES "public"."metrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metrics" ADD CONSTRAINT "metrics_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_counters" ADD CONSTRAINT "progress_counters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_presets" ADD CONSTRAINT "meal_presets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "side_quests" ADD CONSTRAINT "side_quests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weights" ADD CONSTRAINT "weights_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_events" ADD CONSTRAINT "billing_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entitlements" ADD CONSTRAINT "entitlements_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_consents" ADD CONSTRAINT "ai_consents_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_task_id_ai_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."ai_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_scheduled_queries" ADD CONSTRAINT "ai_scheduled_queries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_audit" ADD CONSTRAINT "ai_task_audit_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_task_audit" ADD CONSTRAINT "ai_task_audit_task_id_ai_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."ai_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tasks" ADD CONSTRAINT "ai_tasks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applied_suggestions" ADD CONSTRAINT "applied_suggestions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applied_suggestions" ADD CONSTRAINT "applied_suggestions_result_id_ai_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."ai_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applied_suggestions" ADD CONSTRAINT "applied_suggestions_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_account_id_idx" ON "devices" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "command_log_applied_at_idx" ON "command_log" USING btree ("applied_at");--> statement-breakpoint
CREATE INDEX "deleted_records_account_id_sync_seq_idx" ON "deleted_records" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "quest_consequences_account_id_quest_id_idx" ON "quest_consequences" USING btree ("account_id","quest_id");--> statement-breakpoint
CREATE INDEX "quests_account_id_active_idx" ON "quests" USING btree ("account_id","active");--> statement-breakpoint
CREATE INDEX "quests_account_id_sync_seq_idx" ON "quests" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "quest_logs_account_id_date_idx" ON "quest_logs" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "quest_logs_account_id_sync_seq_idx" ON "quest_logs" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "hero_events_account_id_date_idx" ON "hero_events" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "hero_events_account_id_created_at_idx" ON "hero_events" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "hero_events_account_id_type_idx" ON "hero_events" USING btree ("account_id","type");--> statement-breakpoint
CREATE INDEX "daily_states_account_id_sync_seq_idx" ON "daily_states" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "comeback_events_account_id_date_idx" ON "comeback_events" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "recovery_quests_state_expires_at_idx" ON "recovery_quests" USING btree ("state","expires_at");--> statement-breakpoint
CREATE INDEX "reschedule_events_account_id_date_idx" ON "reschedule_events" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "shield_consumptions_account_id_date_idx" ON "shield_consumptions" USING btree ("account_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "cosmetic_unlocks_account_id_kind_equipped_unique" ON "cosmetic_unlocks" USING btree ("account_id","kind") WHERE "cosmetic_unlocks"."equipped";--> statement-breakpoint
CREATE INDEX "quest_streaks_account_id_sync_seq_idx" ON "quest_streaks" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_account_id_linked_subscription_id_billing_cycle_date_unique" ON "expenses" USING btree ("account_id","linked_subscription_id","billing_cycle_date") WHERE "expenses"."linked_subscription_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "expenses_account_id_occurred_on_idx" ON "expenses" USING btree ("account_id","occurred_on");--> statement-breakpoint
CREATE INDEX "expenses_account_id_category_id_occurred_on_idx" ON "expenses" USING btree ("account_id","category_id","occurred_on");--> statement-breakpoint
CREATE INDEX "expenses_account_id_sync_seq_idx" ON "expenses" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "subscriptions_account_id_sync_seq_idx" ON "subscriptions" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "subscriptions_account_id_active_idx" ON "subscriptions" USING btree ("account_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "metric_entries_account_id_metric_id_date_source_unique" ON "metric_entries" USING btree ("account_id","metric_id","date","source") WHERE "metric_entries"."source" <> 'quest_log';--> statement-breakpoint
CREATE UNIQUE INDEX "metric_entries_quest_log_id_metric_id_unique" ON "metric_entries" USING btree ("quest_log_id","metric_id") WHERE "metric_entries"."quest_log_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "metric_entries_account_id_sync_seq_idx" ON "metric_entries" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "journal_entries_account_id_date_idx" ON "journal_entries" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "journal_entries_account_id_sync_seq_idx" ON "journal_entries" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "meals_account_id_date_idx" ON "meals" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "meals_account_id_sync_seq_idx" ON "meals" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "side_quests_account_id_date_idx" ON "side_quests" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "side_quests_account_id_sync_seq_idx" ON "side_quests" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "weights_account_id_sync_seq_idx" ON "weights" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "billing_events_quarantined_received_at_idx" ON "billing_events" USING btree ("quarantined","received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_provider_provider_ref_unique" ON "entitlements" USING btree ("provider","provider_ref") WHERE "entitlements"."provider" IS NOT NULL AND "entitlements"."provider_ref" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "receipts_account_id_idx" ON "receipts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "receipts_status_created_at_idx" ON "receipts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "ai_results_account_id_sync_seq_idx" ON "ai_results" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "ai_tasks_status_submitted_at_idx" ON "ai_tasks" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "ai_tasks_account_id_quota_month_idx" ON "ai_tasks" USING btree ("account_id","quota_month") WHERE "ai_tasks"."quota_consumed";--> statement-breakpoint
CREATE INDEX "ai_tasks_account_id_sync_seq_idx" ON "ai_tasks" USING btree ("account_id","sync_seq");--> statement-breakpoint
CREATE INDEX "export_jobs_account_id_requested_at_idx" ON "export_jobs" USING btree ("account_id","requested_at");--> statement-breakpoint
CREATE INDEX "export_jobs_status_idx" ON "export_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "export_jobs_expires_at_idx" ON "export_jobs" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_status_next_attempt_at_idx" ON "notification_outbox" USING btree ("status","next_attempt_at");