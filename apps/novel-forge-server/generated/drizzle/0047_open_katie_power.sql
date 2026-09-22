CREATE TYPE "public"."blueprint_phase" AS ENUM('idea', 'heart', 'core', 'world', 'spine', 'volume_one', 'opening');--> statement-breakpoint
CREATE TYPE "public"."ledger_decided_by" AS ENUM('author', 'system');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_kind" AS ENUM('decision', 'direction', 'rejected', 'backlog', 'system');--> statement-breakpoint
CREATE TABLE "decision_ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"kind" "ledger_entry_kind" NOT NULL,
	"phase" "blueprint_phase",
	"topic" varchar(100) NOT NULL,
	"statement" text NOT NULL,
	"why" text,
	"rejected_alternatives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"writer_line" text,
	"decided_by" "ledger_decided_by" NOT NULL,
	"payload" jsonb,
	"links" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"supersedes_id" bigint,
	"superseded_at" timestamp,
	"withdrawn_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "decision_ledger_entries_supersedes_id_unique" UNIQUE("supersedes_id"),
	CONSTRAINT "decision_ledger_entries_withdrawn_check" CHECK ("decision_ledger_entries"."withdrawn_reason" IS NULL OR "decision_ledger_entries"."superseded_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "decision_ledger_entries" ADD CONSTRAINT "decision_ledger_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision_ledger_entries" ADD CONSTRAINT "decision_ledger_entries_supersedes_id_decision_ledger_entries_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."decision_ledger_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decision_ledger_entries_project_id_active_idx" ON "decision_ledger_entries" USING btree ("project_id","created_at") WHERE "decision_ledger_entries"."superseded_at" IS NULL;--> statement-breakpoint
CREATE INDEX "decision_ledger_entries_project_id_topic_idx" ON "decision_ledger_entries" USING btree ("project_id","topic","created_at");