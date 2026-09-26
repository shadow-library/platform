CREATE TYPE "public"."job_event_type" AS ENUM('queued', 'started', 'step', 'retrying', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "job_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"project_id" bigint NOT NULL,
	"session_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" "job_event_type" NOT NULL,
	"data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_events_session_id_seq_unique" UNIQUE("session_id","seq")
);
--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "job_event_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_events" ADD CONSTRAINT "job_events_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_events_job_id_idx" ON "job_events" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_events_project_id_idx" ON "job_events" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refinement_proposals_job_card_run_id_unique" ON "refinement_proposals" USING btree ("run_id") WHERE "refinement_proposals"."kind" in ('organise', 'chapter_plan');