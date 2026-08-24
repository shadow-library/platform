-- T-31: Entitlement & billing grants (ARCHITECTURE §5.4, §10.4, §16), following 0002_add_role_grants's
-- per-migration convention for tables that did not exist yet when that file was written.

ALTER TABLE entitlements OWNER TO memoir_migrator;--> statement-breakpoint
ALTER TABLE billing_events OWNER TO memoir_migrator;--> statement-breakpoint

-- memoir_api: SELECT only on both tables (§5.4). The user surface reads its own tier and never writes
-- it; there is no application route through which it could, and this grant is the layer that holds
-- even if one were ever added by mistake.
GRANT SELECT ON entitlements, billing_events TO memoir_api;--> statement-breakpoint

-- memoir_billing: the sole entitlement writer. `billing_events` is append-only (§10.4) except for the
-- two columns late matching of a quarantined event has to move.
GRANT SELECT, INSERT, UPDATE ON entitlements TO memoir_billing;--> statement-breakpoint
GRANT SELECT, INSERT ON billing_events TO memoir_billing;--> statement-breakpoint
GRANT UPDATE (processed, account_id, quarantined) ON billing_events TO memoir_billing;--> statement-breakpoint

-- The purchase token is how a webhook finds its account (§16.2), so it joins `identity_sub` in the
-- billing role's column-limited read of `accounts` — still nothing else on that table.
GRANT SELECT (purchase_token) ON accounts TO memoir_billing;--> statement-breakpoint

-- Both writes draw a sequence value: `billing_events.id` from its own serial, `entitlements.sync_seq`
-- from the global delta sequence. `0002_add_role_grants`'s `ALL SEQUENCES` grants were a snapshot of
-- the sequences existing then, so every later table's have to be granted with it.
GRANT USAGE, SELECT ON SEQUENCE billing_events_id_seq, sync_seq TO memoir_billing;--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO memoir_api;--> statement-breakpoint

-- memoir_ai deliberately gets nothing here: §5.4 gives it **zero** privileges on `entitlements`, so
-- T-33's execution-time entitlement revalidation reads the tier through the API pool's
-- `EntitlementService`, not through its own.

-- memoir_deleter: DELETE on both for the T-30 deletion state machine.
GRANT SELECT, DELETE ON entitlements, billing_events TO memoir_deleter;--> statement-breakpoint
