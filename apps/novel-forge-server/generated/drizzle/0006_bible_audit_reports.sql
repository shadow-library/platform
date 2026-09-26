CREATE TYPE "public"."validation_finding_decision" AS ENUM('kept', 'skipped');--> statement-breakpoint
ALTER TYPE "public"."job_kind" ADD VALUE 'audit';--> statement-breakpoint
ALTER TYPE "public"."validation_scope" ADD VALUE 'bible';--> statement-breakpoint
CREATE TABLE "validation_finding_decisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" bigint NOT NULL,
	"finding_id" varchar NOT NULL,
	"decision" "validation_finding_decision" NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "validation_finding_decisions_report_id_finding_id_unique" UNIQUE("report_id","finding_id")
);
--> statement-breakpoint
ALTER TABLE "validation_reports" ADD COLUMN "findings" jsonb;--> statement-breakpoint
ALTER TABLE "validation_reports" ADD COLUMN "checked" jsonb;--> statement-breakpoint
ALTER TABLE "validation_reports" ADD COLUMN "run_id" uuid;--> statement-breakpoint
ALTER TABLE "validation_reports" ADD COLUMN "proposal_id" bigint;--> statement-breakpoint
ALTER TABLE "validation_finding_decisions" ADD CONSTRAINT "validation_finding_decisions_report_id_validation_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."validation_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_proposal_id_refinement_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."refinement_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "validation_reports_run_id_unique" ON "validation_reports" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "validation_reports_proposal_id_idx" ON "validation_reports" USING btree ("proposal_id");