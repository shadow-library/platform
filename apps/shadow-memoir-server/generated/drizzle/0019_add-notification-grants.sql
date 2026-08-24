-- T-34: Notifications via pulse grants (ARCHITECTURE §5.4, §17), following 0005_add-finance-grants's
-- per-migration convention for tables that did not exist yet when 0002_add_role_grants was written.

ALTER TABLE notification_outbox OWNER TO memoir_migrator;--> statement-breakpoint

-- memoir_api: full CRUD. Every producer (the AI-completion hook, the billing-due sweep, the digest
-- assembly sweep) and the sender's drain loop all run on the default pool — this table carries no
-- dedicated role of its own, unlike ai/billing/deletion (§5.4 lists none for it).
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_outbox TO memoir_api;--> statement-breakpoint

-- memoir_deleter: SELECT, DELETE so the T-30 deletion state machine can purge an account's queued sends.
GRANT SELECT, DELETE ON notification_outbox TO memoir_deleter;--> statement-breakpoint
