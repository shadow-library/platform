-- T-24: Quick logs grants (ARCHITECTURE §5.4, §10.4), following 0005_add-finance-grants's/
-- 0007_add-metrics-grants's per-migration convention for tables that did not exist yet when
-- 0002_add_role_grants was written.

ALTER TABLE journal_entries OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE meals OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE meal_presets OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE weights OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE side_quests OWNER TO memoir_migrator;--> statement-breakpoint

-- memoir_api: full CRUD on every quick-log table — none is append-only (a journal entry/meal is
-- owner-editable/deletable, a weight is upserted in place on same-day re-log, presets are a plain
-- catalogue, side quests are owner-deletable like every other quick-log record).
GRANT SELECT, INSERT, UPDATE, DELETE ON journal_entries, meals, meal_presets, weights, side_quests TO memoir_api;--> statement-breakpoint

-- memoir_ai: read scope per §15.5, gated further at the worker's read-assembly layer by
-- `ai_consents` (`journal_reflection_reason`/`health` classes, T-32) rather than by a DB grant — the
-- same non-DB-enforced posture `0007_add-metrics-grants` documents for `metrics`/`metric_entries`.
GRANT SELECT ON journal_entries, meals, meal_presets, weights, side_quests TO memoir_ai;--> statement-breakpoint

-- memoir_deleter: DELETE on every quick-log table for the T-30 deletion state machine.
GRANT SELECT, DELETE ON journal_entries, meals, meal_presets, weights, side_quests TO memoir_deleter;--> statement-breakpoint
