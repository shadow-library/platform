CREATE TYPE "public"."receipt_status" AS ENUM('pending_upload', 'stored', 'deleted');--> statement-breakpoint
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
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "receipts_account_id_idx" ON "receipts" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "receipts_status_created_at_idx" ON "receipts" USING btree ("status","created_at");--> statement-breakpoint

-- T-26: Receipts grants (ARCHITECTURE §5.4, §10.4, §19), following 0005_add-finance-grants's/
-- 0007_add-metrics-grants's/0010_add-quicklogs-grants's/0013_add-billing-grants's per-migration
-- convention for tables that did not exist yet when 0002_add_role_grants was written.

ALTER TABLE receipts OWNER TO memoir_migrator;--> statement-breakpoint

-- memoir_api: full CRUD — the presign/confirm/download endpoints and the expense-deletion cascade all run
-- on the API path's default pool.
GRANT SELECT, INSERT, UPDATE, DELETE ON receipts TO memoir_api;--> statement-breakpoint

-- memoir_deleter: SELECT, DELETE for the T-30 deletion state machine's relational cleanup step. Blob
-- deletion itself is a prefix walk against the bucket (§21.1 step 3), not a row-driven delete.
GRANT SELECT, DELETE ON receipts TO memoir_deleter;