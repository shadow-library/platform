CREATE TYPE "public"."cost_tier" AS ENUM('economy', 'balanced', 'performant');--> statement-breakpoint
CREATE TYPE "public"."knowledge_status" AS ENUM('provisional', 'committed');--> statement-breakpoint
CREATE TYPE "public"."milestone_kind" AS ENUM('rank', 'event', 'learned_from', 'custom');--> statement-breakpoint
CREATE TYPE "public"."milestone_state" AS ENUM('open', 'planned', 'reached');--> statement-breakpoint
CREATE TYPE "public"."volume_state" AS ENUM('not_started', 'active', 'goal_met');--> statement-breakpoint
CREATE TYPE "public"."cost_source" AS ENUM('provider', 'gateway', 'estimate');--> statement-breakpoint
ALTER TYPE "public"."refinement_kind" ADD VALUE 'chapter_plan';--> statement-breakpoint
ALTER TYPE "public"."refinement_kind" ADD VALUE 'organise';--> statement-breakpoint
ALTER TYPE "public"."job_kind" ADD VALUE 'organise';--> statement-breakpoint
ALTER TYPE "public"."job_kind" ADD VALUE 'plan';--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"milestone_key" varchar NOT NULL,
	"label" varchar(500) NOT NULL,
	"subject_entity_key" varchar,
	"kind" "milestone_kind" DEFAULT 'custom' NOT NULL,
	"state" "milestone_state" DEFAULT 'open' NOT NULL,
	"planned_chapter" integer,
	"reached_chapter" integer,
	"bound_revision" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_project_id_milestone_key_unique" UNIQUE("project_id","milestone_key")
);
--> statement-breakpoint
CREATE TABLE "authoring_claims" (
	"project_id" bigint PRIMARY KEY NOT NULL,
	"job_id" uuid,
	"kind" "job_kind" NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "cost_tier" "cost_tier" DEFAULT 'balanced' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "theme" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "ending_question" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "ending" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "reader_promise" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "protagonist_key" varchar;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "opposition" text;--> statement-breakpoint
ALTER TABLE "chapters" ADD COLUMN "volume_key" varchar;--> statement-breakpoint
ALTER TABLE "canon_facts" ADD COLUMN "unlock" jsonb;--> statement-breakpoint
ALTER TABLE "canon_facts" ADD COLUMN "planned_chapter" integer;--> statement-breakpoint
ALTER TABLE "canon_facts" ADD COLUMN "disclosed_in_chapter" integer;--> statement-breakpoint
ALTER TABLE "canon_facts" ADD COLUMN "allowed_clues" jsonb;--> statement-breakpoint
ALTER TABLE "character_knowledge" ADD COLUMN "status" "knowledge_status" DEFAULT 'committed' NOT NULL;--> statement-breakpoint
ALTER TABLE "character_knowledge" ADD COLUMN "draft_revision" integer;--> statement-breakpoint
ALTER TABLE "volumes" ADD COLUMN "state" "volume_state" DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "direction" text;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "content_mode" "content_mode";--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "scenes" jsonb;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "claimed_milestones" jsonb;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "is_ending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "applied_proposal_id" bigint;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "suggestions" jsonb;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "content_mode" "content_mode";--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD COLUMN "cost_tier" "cost_tier";--> statement-breakpoint
ALTER TABLE "model_calls" ADD COLUMN "cost_source" "cost_source";--> statement-breakpoint
ALTER TABLE "model_calls" ADD COLUMN "tier" "cost_tier";--> statement-breakpoint
ALTER TABLE "model_calls" ADD COLUMN "content_mode" "content_mode";--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authoring_claims" ADD CONSTRAINT "authoring_claims_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authoring_claims" ADD CONSTRAINT "authoring_claims_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_applied_proposal_id_refinement_proposals_id_fk" FOREIGN KEY ("applied_proposal_id") REFERENCES "public"."refinement_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_applied_proposal_id_idx" ON "chat_messages" USING btree ("applied_proposal_id");