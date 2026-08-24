CREATE TYPE "public"."export_job_status" AS ENUM('pending', 'running', 'done', 'failed');--> statement-breakpoint
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
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_jobs_account_id_requested_at_idx" ON "export_jobs" USING btree ("account_id","requested_at");--> statement-breakpoint
CREATE INDEX "export_jobs_status_idx" ON "export_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "export_jobs_expires_at_idx" ON "export_jobs" USING btree ("expires_at");--> statement-breakpoint

-- T-29: Export jobs grants (ARCHITECTURE §5.4, §20), following 0005_add-finance-grants's/
-- 0007_add-metrics-grants's/0010_add-quicklogs-grants's/0013_add-billing-grants's/0014's/0016's
-- per-migration convention for tables that did not exist yet when 0002_add_role_grants was written.

ALTER TABLE export_jobs OWNER TO memoir_migrator;--> statement-breakpoint

-- memoir_api: full CRUD — the enqueue/status endpoints and both assembler/cleanup sweeps all run on the
-- API path's default pool (§20 is not a `memoir_deleter` concern day-to-day; it is routine, not account
-- deletion — T-30's own purge, however, does need it, granted below).
GRANT SELECT, INSERT, UPDATE, DELETE ON export_jobs TO memoir_api;--> statement-breakpoint

-- memoir_deleter: SELECT, DELETE so the T-30 state machine can drop any export jobs still on file for an
-- account being deleted (`export_jobs` is in `DeletionRepository`'s `PURGE_ORDER`), alongside its object
-- under the same bucket prefix walk (step 3 wipes both `r/{account}/` and `exports/{account}/`).
GRANT SELECT, DELETE ON export_jobs TO memoir_deleter;