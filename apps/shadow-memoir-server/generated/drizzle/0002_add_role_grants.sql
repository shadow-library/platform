-- T-14: DB roles & grants (ARCHITECTURE §5.4, §10.4).
--
-- Roles are cluster-level in Postgres, so every CREATE ROLE is guarded by an existence check —
-- this file runs once per database on the cluster (template DB, `shadow_memoir`, every cloned test
-- DB's own template run), and a second CREATE ROLE for the same name errors without the guard.
--
-- Convention for T-18/T-25/T-31/T-32 (new tables land in their own migration, not here): add a new
-- migration with a GRANT block per role following this file's shape — append-only tables get
-- `GRANT INSERT, SELECT`, mutable tables get the full `SELECT, INSERT, UPDATE, DELETE`, memoir_ai and
-- memoir_billing get exactly the column/table scope ARCHITECTURE §5.4/§15.5/§16 name for them, and
-- memoir_deleter gets `SELECT, DELETE` on anything a new deletion step must reach. Never edit this
-- file once merged — grants for tables that do not exist yet cannot be expressed against them.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memoir_migrator') THEN
    CREATE ROLE memoir_migrator WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memoir_api') THEN
    CREATE ROLE memoir_api WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memoir_ai') THEN
    CREATE ROLE memoir_ai WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memoir_billing') THEN
    CREATE ROLE memoir_billing WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'memoir_deleter') THEN
    CREATE ROLE memoir_deleter WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT;
  END IF;
END
$$;--> statement-breakpoint

-- Passwords are an ops secret (`secrets/<env>/shadow-memoir.enc.env`, T-04) applied out of band via
-- `ALTER ROLE ... PASSWORD` after this migration runs; roles are inert (no valid auth) until then.
-- Chose LOGIN roles with their own dedicated connections over NOLOGIN + `SET ROLE`: `DatabaseService`
-- pools a fixed set of physical connections per Drizzle client, and a `SET ROLE` issued on one pooled
-- connection would silently persist onto whatever unrelated query that physical connection serves
-- next unless every call site remembered to `RESET ROLE` — a footgun this design avoids entirely by
-- giving every role its own physically separate pool instead of a shared one with mutable session state.

-- `memoir_migrator` owns DDL (ARCHITECTURE §5.4): existing objects transfer to it here so a future
-- migrate credential provisioned as `memoir_migrator` (or a superuser bootstrap role, which bypasses
-- ownership checks entirely) can alter them; which literal credential each environment's migrate Job
-- connects as remains T-04 (operator-assisted) scope.
ALTER TABLE accounts OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE quests OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE quest_consequences OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE quest_logs OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE quest_streaks OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE hero_events OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE daily_states OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE reschedule_events OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE recovery_quests OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE comeback_events OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE returner_events OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE shield_consumptions OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE achievements_earned OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE titles_earned OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE cosmetic_unlocks OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE command_log OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE deleted_records OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE devices OWNER TO memoir_migrator;--> statement-breakpoint
ALTER SEQUENCE sync_seq OWNER TO memoir_migrator;--> statement-breakpoint

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO memoir_api, memoir_ai, memoir_billing, memoir_deleter;--> statement-breakpoint

-- memoir_api: the API/command path's default pool. Full CRUD on every user-facing, non-append-only
-- table; INSERT + SELECT only (no UPDATE/DELETE grant at all) on the §10.4 append-only tables that
-- exist today. `entitlements`/`billing_events`/`ai_*` do not exist yet (T-31/T-32 add memoir_api's
-- SELECT-only grants on them in their own migration).
GRANT SELECT, INSERT, UPDATE, DELETE ON accounts, quests, quest_consequences, quest_logs, quest_streaks, daily_states, recovery_quests, devices, command_log, deleted_records TO memoir_api;--> statement-breakpoint
GRANT SELECT, INSERT ON hero_events, reschedule_events, comeback_events, returner_events, shield_consumptions, achievements_earned, titles_earned, cosmetic_unlocks TO memoir_api;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO memoir_api;--> statement-breakpoint

-- memoir_ai: the AI batch module's dedicated pool (ARCHITECTURE §15.5 read scope, in-process now).
-- SELECT on the read-scope tables that exist today; zero write privileges anywhere except the
-- `ai_results`/`ai_tasks`/`ai_task_audit` grants T-32 adds once those tables land. `accounts` and
-- `devices` are column-limited: profile/mode columns only on `accounts` (never a Hero mirror column),
-- push columns only on `devices`.
GRANT SELECT ON quests, quest_consequences, quest_logs, hero_events, daily_states, recovery_quests, comeback_events, returner_events, shield_consumptions, achievements_earned, titles_earned TO memoir_ai;--> statement-breakpoint
GRANT SELECT (
  id, identity_sub, email, display_name, photo_url, auth_provider, default_currency, enabled_currencies, timezone,
  schedule_start_min, schedule_end_min, theme, week_start, intensity_mode, returner_threshold_days, feature_flags,
  ocr_quota_date, ocr_quota_count, notification_prefs, onboarding_completed_at, deletion_state, deletion_started_at,
  created_at, updated_at
) ON accounts TO memoir_ai;--> statement-breakpoint
GRANT SELECT (id, account_id, push_subscription, push_opt_in, reminder_prefs) ON devices TO memoir_ai;--> statement-breakpoint

-- memoir_billing: the billing webhook module's dedicated pool (ARCHITECTURE §16). `entitlements`/
-- `billing_events` do not exist yet (T-31 adds memoir_billing's SELECT/INSERT/UPDATE grants on them in
-- its own migration); today's scope is exactly the account-matching read §5.4 names.
GRANT SELECT (id, identity_sub) ON accounts TO memoir_billing;--> statement-breakpoint

-- memoir_deleter: the account-deletion state machine (§21), the one role with DELETE on the §10.4
-- append-only tables — "no runtime path can mutate history" stays true because ordinary API traffic
-- never connects as this role.
GRANT SELECT, DELETE ON accounts, quests, quest_consequences, quest_logs, quest_streaks, daily_states, recovery_quests, devices, command_log, deleted_records, hero_events, reschedule_events, comeback_events, returner_events, shield_consumptions, achievements_earned, titles_earned, cosmetic_unlocks TO memoir_deleter;--> statement-breakpoint
