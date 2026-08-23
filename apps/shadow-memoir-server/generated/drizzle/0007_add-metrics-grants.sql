-- T-23: Metrics & manual health tracking grants (ARCHITECTURE §5.4, §10.4, §15.5, §18), following
-- 0005_add-finance-grants's per-migration convention for tables that did not exist yet when
-- 0002_add_role_grants was written.

ALTER TABLE metrics OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE metric_entries OWNER TO memoir_migrator;--> statement-breakpoint

-- memoir_api: full CRUD on both tables — neither is append-only (a metric is soft-deleted via `active`,
-- an entry is upserted in place on same-day re-log).
GRANT SELECT, INSERT, UPDATE, DELETE ON metrics, metric_entries TO memoir_api;--> statement-breakpoint

-- memoir_ai: read scope per §15.5. `metrics`/`metric_entries` carry no most-sensitive text column, but
-- `is_health` rows are still consent-gated at the worker's read-assembly layer (the separate
-- `ai_consents` 'health' class, T-32) rather than by a DB grant — the same posture finance's fx_rates
-- comment describes for its own non-DB-enforced boundary.
GRANT SELECT ON metrics, metric_entries TO memoir_ai;--> statement-breakpoint

-- memoir_deleter: DELETE on both tables for the T-30 deletion state machine.
GRANT SELECT, DELETE ON metrics, metric_entries TO memoir_deleter;--> statement-breakpoint
