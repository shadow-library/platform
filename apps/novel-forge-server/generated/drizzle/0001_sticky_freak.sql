CREATE TYPE "public"."draft_review_status" AS ENUM('generating', 'needs_review', 'contradiction', 'approved', 'final');--> statement-breakpoint
CREATE TYPE "public"."draft_revision_source" AS ENUM('generated', 'patched', 'rewritten', 'revised', 'imported', 'hand_edited');--> statement-breakpoint
CREATE TYPE "public"."model_call_status" AS ENUM('ok', 'parse_error', 'repaired', 'refused', 'transport_error', 'timeout');--> statement-breakpoint
CREATE TYPE "public"."tool_call_status" AS ENUM('ok', 'invalid_args', 'handler_error', 'budget_exceeded');--> statement-breakpoint
CREATE TYPE "public"."user_feedback_artifact_type" AS ENUM('draft', 'continuity_proposal', 'volume', 'bible_document', 'validation_report');--> statement-breakpoint
CREATE TYPE "public"."user_feedback_disposition" AS ENUM('revision_requested', 'approved', 'rejected', 'comment');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('running', 'completed', 'awaiting_review', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "context_packs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"purpose" varchar NOT NULL,
	"chapter" integer,
	"hash" varchar NOT NULL,
	"budget_tokens" integer,
	"used_tokens" integer,
	"sections" jsonb,
	"unresolved_refs" jsonb,
	"rendered" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "context_packs_project_id_hash_unique" UNIQUE("project_id","hash")
);
--> statement-breakpoint
CREATE TABLE "draft_revisions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"draft_id" bigint NOT NULL,
	"revision" integer NOT NULL,
	"source" "draft_revision_source" NOT NULL,
	"body" text NOT NULL,
	"summary" text,
	"state" jsonb,
	"run_id" varchar,
	"feedback_id" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "draft_revisions_draft_id_revision_unique" UNIQUE("draft_id","revision")
);
--> statement-breakpoint
CREATE TABLE "lore_chunks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"kind" varchar NOT NULL,
	"ref_key" varchar NOT NULL,
	"source_updated_at" timestamp NOT NULL,
	"text" text NOT NULL,
	"embedding" vector(1024),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lore_chunks_project_id_kind_ref_key_unique" UNIQUE("project_id","kind","ref_key")
);
--> statement-breakpoint
CREATE TABLE "model_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"run_id" varchar,
	"node" varchar,
	"role" varchar NOT NULL,
	"provider" varchar NOT NULL,
	"model" varchar NOT NULL,
	"prompt_key" varchar NOT NULL,
	"prompt_version" varchar NOT NULL,
	"status" "model_call_status" NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"cost_usd" numeric(12, 6),
	"attempt" smallint DEFAULT 0 NOT NULL,
	"raw_output" text,
	"error" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" varchar NOT NULL,
	"model_call_id" bigint,
	"node" varchar NOT NULL,
	"tool" varchar NOT NULL,
	"args" jsonb,
	"result_digest" varchar,
	"status" "tool_call_status" NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_feedback" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"artifact_type" "user_feedback_artifact_type" NOT NULL,
	"artifact_ref" varchar NOT NULL,
	"disposition" "user_feedback_disposition" NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" bigint NOT NULL,
	"job_id" varchar,
	"graph" varchar NOT NULL,
	"target" varchar NOT NULL,
	"status" "workflow_run_status" DEFAULT 'running' NOT NULL,
	"outcome" varchar,
	"input" jsonb,
	"error" jsonb,
	"node_trace" jsonb,
	"context_pack_id" bigint,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "volumes" ADD COLUMN "epitome" text;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "context_refs" jsonb;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "review_status" "draft_review_status" DEFAULT 'generating' NOT NULL;--> statement-breakpoint
ALTER TABLE "context_packs" ADD CONSTRAINT "context_packs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_revisions" ADD CONSTRAINT "draft_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_revisions" ADD CONSTRAINT "draft_revisions_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lore_chunks" ADD CONSTRAINT "lore_chunks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_calls" ADD CONSTRAINT "model_calls_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lore_chunks_project_id_kind_idx" ON "lore_chunks" USING btree ("project_id","kind");--> statement-breakpoint
CREATE INDEX "model_calls_project_id_created_at_idx" ON "model_calls" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "model_calls_run_id_idx" ON "model_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "model_calls_prompt_key_prompt_version_idx" ON "model_calls" USING btree ("prompt_key","prompt_version");--> statement-breakpoint
CREATE INDEX "tool_calls_run_id_idx" ON "tool_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "user_feedback_project_id_artifact_type_artifact_ref_idx" ON "user_feedback" USING btree ("project_id","artifact_type","artifact_ref");--> statement-breakpoint
CREATE INDEX "workflow_runs_project_id_graph_status_idx" ON "workflow_runs" USING btree ("project_id","graph","status");--> statement-breakpoint
CREATE INDEX "workflow_runs_job_id_idx" ON "workflow_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS lore_chunks_embedding_idx ON lore_chunks USING hnsw (embedding vector_cosine_ops);