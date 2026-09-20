CREATE TYPE "public"."expense_audit_action" AS ENUM('created', 'updated', 'deleted', 'receipt_confirmed');--> statement-breakpoint
CREATE TABLE "expense_audits" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"expense_id" uuid NOT NULL,
	"action" "expense_audit_action" NOT NULL,
	"changes" jsonb NOT NULL,
	"device_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_seq" bigint DEFAULT nextval('sync_seq') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "expense_audits" ADD CONSTRAINT "expense_audits_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_audits_account_id_expense_id_idx" ON "expense_audits" USING btree ("account_id","expense_id");--> statement-breakpoint
CREATE INDEX "expense_audits_account_id_sync_seq_idx" ON "expense_audits" USING btree ("account_id","sync_seq");