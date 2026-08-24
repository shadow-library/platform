-- T-32: AI schema grants (ARCHITECTURE §5.4, §10.4, §15.5), extending 0002_add_role_grants's
-- per-migration convention for tables that did not exist yet when that file was written. The read-scope
-- tables §15.5 lists that already existed (quests, hero_events, expenses, metrics, journal_entries, …)
-- were already granted to memoir_ai by 0002/0005/0007/0010 — only the six AI tables themselves are new.
--
-- Deviation from §5.4's literal wording: it describes memoir_ai's ai_tasks UPDATE grant as
-- "(status, error, started_at, finished_at)", but no `started_at` column exists anywhere in this schema
-- (§10.3's ai_tasks catalogue has `claimed_at`, not `started_at`, and §15.2's claim SQL sets
-- `claimed_by`/`claimed_at`/`status`). Read as `claimed_at` standing in for "started_at" — the same
-- resolution 0013 already established for §15.5 vs §5.4 disagreeing on `entitlements` (§5.4 wins: memoir_ai
-- gets zero privileges there). The column-limited grant below is `status, error, claimed_by, claimed_at,
-- finished_at, quota_consumed, sync_seq` — every column T-33's claim/terminal-transition writes actually
-- touch, `quota_consumed` included because a `failed` transition refunds quota (PRD §6.8) and only the
-- worker ever drives a task to `failed`.

ALTER TABLE ai_tasks OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE ai_results OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE ai_scheduled_queries OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE ai_consents OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE applied_suggestions OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE ai_task_audit OWNER TO memoir_migrator;--> statement-breakpoint

-- memoir_api: the user-facing surface (T-32). `ai_tasks` is INSERT+SELECT, with UPDATE restricted to
-- exactly the columns the cancel transition writes (ARCHITECTURE §15.1) — no code path ever needs more,
-- so the grant is the enforcement, not just the convention. `ai_results` is SELECT only — worker-written,
-- owner-read via `/sync/delta` (§10.4). `ai_scheduled_queries`/`ai_consents` are full CRUD (PUT/DELETE,
-- GET/PUT user surfaces) except `ai_consents` never DELETEs — withdrawal is an UPDATE of `withdrawn_at`,
-- so history stays a single upserted row, never a growing log. `applied_suggestions` is append-only
-- (§10.4): the apply endpoint INSERTs, never UPDATEs or DELETEs. `ai_task_audit` is worker-written only —
-- memoir_api gets SELECT for a future audit view, never INSERT.
GRANT SELECT, INSERT ON ai_tasks TO memoir_api;--> statement-breakpoint
GRANT UPDATE (status, quota_consumed, sync_seq) ON ai_tasks TO memoir_api;--> statement-breakpoint
GRANT SELECT ON ai_results TO memoir_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ai_scheduled_queries TO memoir_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON ai_consents TO memoir_api;--> statement-breakpoint
GRANT SELECT, INSERT ON applied_suggestions TO memoir_api;--> statement-breakpoint
GRANT SELECT ON ai_task_audit TO memoir_api;--> statement-breakpoint

-- memoir_ai: the AI batch module's dedicated pool (§15.2-§15.7, wired by T-33). SELECT the full
-- `ai_tasks` row (claim scan + execution-time revalidation) and `ai_consents` (the consent snapshot);
-- INSERT `ai_results` (append-only, worker-written) and `ai_task_audit` (append-only, worker-written);
-- SELECT `ai_scheduled_queries` (nightly enumeration, §15.7). Zero privileges on `applied_suggestions` —
-- the apply path is user-driven through memoir_api only, the worker never touches it.
--
-- SELECT on `ai_results`/`ai_task_audit` is a deliberate addition beyond §5.4's literal "INSERT on
-- ai_results" wording: PostgreSQL requires SELECT to use `RETURNING`, which every repository in this
-- codebase relies on (ARCHITECTURE §8.3's `OwnerScopedRepository` convention) — without it, the worker's
-- own `.insert(...).returning()` of the row it just wrote fails with a grant error. It does not widen
-- the worker's cross-account reach beyond what it already has (it authored these exact rows).
GRANT SELECT ON ai_tasks, ai_consents, ai_scheduled_queries TO memoir_ai;--> statement-breakpoint
GRANT UPDATE (status, error, claimed_by, claimed_at, finished_at, quota_consumed, sync_seq) ON ai_tasks TO memoir_ai;--> statement-breakpoint
GRANT SELECT, INSERT ON ai_results TO memoir_ai;--> statement-breakpoint
GRANT SELECT, INSERT ON ai_task_audit TO memoir_ai;--> statement-breakpoint

-- memoir_ai writes two bigserial-keyed tables (ai_results, ai_task_audit) and re-stamps ai_tasks.sync_seq
-- on every UPDATE (§12.2) — none of which it inherits from 0002's one-time "ALL SEQUENCES" grant, since
-- these sequences did not exist then.
GRANT USAGE, SELECT ON SEQUENCE ai_results_id_seq, ai_task_audit_id_seq, sync_seq TO memoir_ai;--> statement-breakpoint

-- memoir_deleter: DELETE on every AI table for the T-30 deletion state machine (not yet built; granted
-- now so no later migration has to touch these table definitions again).
GRANT SELECT, DELETE ON ai_tasks, ai_results, ai_scheduled_queries, ai_consents, applied_suggestions, ai_task_audit TO memoir_deleter;--> statement-breakpoint

-- Re-issued because it is a snapshot-at-grant-time privilege (0013's same convention): covers the new
-- bigserial sequences (ai_results_id_seq, ai_task_audit_id_seq, applied_suggestions_id_seq) for memoir_api.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO memoir_api;--> statement-breakpoint
