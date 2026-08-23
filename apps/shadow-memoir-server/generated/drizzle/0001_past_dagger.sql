CREATE TYPE "public"."module_link" AS ENUM('journal', 'meal', 'weight');--> statement-breakpoint
CREATE TYPE "public"."partial_mode" AS ENUM('scaled', 'actual', 'none');--> statement-breakpoint
CREATE TYPE "public"."stat_affinity" AS ENUM('discipline', 'body', 'wealth', 'mind');--> statement-breakpoint
CREATE TYPE "public"."strictness" AS ENUM('anchor', 'routine', 'goal', 'recovery', 'optional');--> statement-breakpoint
CREATE TYPE "public"."quest_log_state" AS ENUM('completed', 'partial', 'skipped', 'missed', 'late', 'postponed', 'rescheduled', 'recovery');--> statement-breakpoint
CREATE TYPE "public"."reason_tag" AS ENUM('forgot', 'too_tired', 'task_too_big', 'schedule_conflict', 'avoided_it', 'emotional_resistance', 'health', 'travel', 'family_social', 'work_emergency', 'not_important_anymore', 'poorly_planned', 'other');--> statement-breakpoint
CREATE TYPE "public"."hero_event_type" AS ENUM('quest_complete', 'quest_partial', 'quest_late', 'recovery', 'level_up', 'achievement_unlock', 'coin_grant', 'crown_banked', 'side_quest', 'journal', 'meal', 'weight', 'coin_spend', 'recovery_spawned', 'recovery_completed', 'recovery_expired', 'crown_init', 'crown_forfeit');--> statement-breakpoint
CREATE TYPE "public"."momentum_bucket" AS ENUM('cold', 'steady', 'warm');--> statement-breakpoint
CREATE TYPE "public"."comeback_event_kind" AS ENUM('armed', 're_armed', 'fired', 're_fired');--> statement-breakpoint
CREATE TYPE "public"."comeback_trigger_kind" AS ENUM('anchor_miss_yesterday', 'miss_within_days');--> statement-breakpoint
CREATE TYPE "public"."recovery_quest_state" AS ENUM('pending', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."cosmetic_source" AS ENUM('coin', 'achievement');--> statement-breakpoint
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
	"source" "cosmetic_source" NOT NULL,
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
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL,
	CONSTRAINT "quest_streaks_account_id_quest_id_pk" PRIMARY KEY("account_id","quest_id"),
	CONSTRAINT "quest_streaks_shields_available_check" CHECK ("quest_streaks"."shields_available" BETWEEN 0 AND 2),
	CONSTRAINT "quest_streaks_current_run_days_check" CHECK ("quest_streaks"."current_run_days" >= 0),
	CONSTRAINT "quest_streaks_best_run_days_check" CHECK ("quest_streaks"."best_run_days" >= 0),
	CONSTRAINT "quest_streaks_completions_toward_shield_check" CHECK ("quest_streaks"."completions_toward_shield" >= 0)
);
--> statement-breakpoint
ALTER TABLE "quest_consequences" ADD CONSTRAINT "quest_consequences_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_consequences" ADD CONSTRAINT "quest_consequences_quest_id_quests_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "quest_streaks_account_id_sync_seq_idx" ON "quest_streaks" USING btree ("account_id","sync_seq");