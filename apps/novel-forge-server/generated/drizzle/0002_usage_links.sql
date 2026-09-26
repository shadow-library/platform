ALTER TABLE "model_calls" ADD COLUMN "chapter" integer;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD COLUMN "parent_run_id" uuid;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_parent_run_id_workflow_runs_id_fk" FOREIGN KEY ("parent_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_calls_project_id_chapter_idx" ON "model_calls" USING btree ("project_id","chapter");--> statement-breakpoint
CREATE INDEX "workflow_runs_parent_run_id_idx" ON "workflow_runs" USING btree ("parent_run_id");