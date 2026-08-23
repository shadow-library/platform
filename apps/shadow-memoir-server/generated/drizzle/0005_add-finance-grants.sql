-- T-25: Finance core grants (ARCHITECTURE §5.4, §10.4, §15.5), following 0002_add_role_grants's
-- per-migration convention for tables that did not exist yet when that file was written.

ALTER TABLE expense_categories OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE expenses OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE subscriptions OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE fx_rates OWNER TO memoir_migrator;--> statement-breakpoint

-- memoir_api: full CRUD on the mutable, non-append-only finance tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON expense_categories, expenses, subscriptions TO memoir_api;--> statement-breakpoint

-- fx_rates carries no account_id (§14.1: a shared, date-scoped cache, not user-owned data) — memoir_api
-- reads it at capture-at-entry time but never writes it; only the reconciliation sweep does, under the
-- same memoir_api pool since it runs in-process on the API replica today (ARCHITECTURE §29) and moves
-- to its own role only if the worker split gives it a dedicated connection.
GRANT SELECT, INSERT, UPDATE ON fx_rates TO memoir_api;--> statement-breakpoint

-- memoir_ai: read scope per §15.5 — expenses minus receipt_ref (no receipt need), subscriptions whole.
GRANT SELECT (
  id, account_id, amount_minor, amount_text, currency, fx_rate, home_amount_minor, fx_rate_date,
  category_id, merchant, note, line_items, occurred_on, logged_at, source, linked_quest_id,
  linked_subscription_id, billing_cycle_date, sync_seq, created_at, updated_at
) ON expenses TO memoir_ai;--> statement-breakpoint
GRANT SELECT ON subscriptions TO memoir_ai;--> statement-breakpoint

-- memoir_deleter: DELETE on every finance table for the T-30 deletion state machine.
GRANT SELECT, DELETE ON expense_categories, expenses, subscriptions, fx_rates TO memoir_deleter;--> statement-breakpoint
