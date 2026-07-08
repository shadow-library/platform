CREATE TYPE "public"."chat_message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."chat_scope" AS ENUM('novel', 'bible_document', 'volume_plan', 'volume', 'arc_plan', 'arc', 'brief');--> statement-breakpoint
CREATE TYPE "public"."chat_session_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."refinement_kind" AS ENUM('chat', 'premise_enhance', 'bible_audit', 'arc_plan');--> statement-breakpoint
CREATE TYPE "public"."refinement_proposal_status" AS ENUM('pending', 'applied', 'discarded', 'superseded', 'conflicted');--> statement-breakpoint
ALTER TYPE "public"."user_feedback_artifact_type" ADD VALUE 'refinement_proposal';--> statement-breakpoint
CREATE TABLE "arcs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"arc_key" varchar NOT NULL,
	"volume_key" varchar NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"title" varchar(500),
	"objective" text,
	"escalation" text,
	"payoff" text,
	"hook" text,
	"chapter_start" integer,
	"chapter_end" integer,
	"cast" jsonb,
	"status" "plan_status" DEFAULT 'draft' NOT NULL,
	"body" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"content_hash" varchar,
	"stale_reason" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "arcs_project_id_arc_key_unique" UNIQUE("project_id","arc_key"),
	CONSTRAINT "arcs_chapter_range_check" CHECK ("arcs"."chapter_start" <= "arcs"."chapter_end")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"project_id" bigint NOT NULL,
	"ordinal" integer NOT NULL,
	"role" "chat_message_role" NOT NULL,
	"content" text NOT NULL,
	"proposal_id" bigint,
	"run_id" varchar,
	"tokens" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chat_messages_session_id_ordinal_unique" UNIQUE("session_id","ordinal")
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" bigint NOT NULL,
	"scope_type" "chat_scope" NOT NULL,
	"scope_ref" varchar,
	"title" varchar(500),
	"status" "chat_session_status" DEFAULT 'active' NOT NULL,
	"summary" text,
	"summary_through_ordinal" integer DEFAULT 0 NOT NULL,
	"last_turn_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refinement_proposals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"session_id" uuid,
	"message_id" bigint,
	"scope_type" "chat_scope" NOT NULL,
	"scope_ref" varchar,
	"kind" "refinement_kind" NOT NULL,
	"status" "refinement_proposal_status" DEFAULT 'pending' NOT NULL,
	"summary" text,
	"change_set" jsonb NOT NULL,
	"baseline" jsonb NOT NULL,
	"model" varchar,
	"run_id" varchar,
	"applied_at" timestamp,
	"error" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "volumes" ADD COLUMN "target_chapter_count" integer;--> statement-breakpoint
ALTER TABLE "volumes" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "volumes" ADD COLUMN "content_hash" varchar;--> statement-breakpoint
ALTER TABLE "volumes" ADD COLUMN "stale_reason" varchar;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "arc_key" varchar;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "ending_contract" jsonb;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "content_hash" varchar;--> statement-breakpoint
ALTER TABLE "briefs" ADD COLUMN "stale_reason" varchar;--> statement-breakpoint
ALTER TABLE "arcs" ADD CONSTRAINT "arcs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refinement_proposals" ADD CONSTRAINT "refinement_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refinement_proposals" ADD CONSTRAINT "refinement_proposals_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arcs_project_id_volume_key_ordinal_idx" ON "arcs" USING btree ("project_id","volume_key","ordinal");--> statement-breakpoint
CREATE INDEX "chat_sessions_project_id_status_idx" ON "chat_sessions" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "chat_sessions_project_id_scope_idx" ON "chat_sessions" USING btree ("project_id","scope_type","scope_ref");--> statement-breakpoint
CREATE INDEX "refinement_proposals_project_id_status_idx" ON "refinement_proposals" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "refinement_proposals_session_id_idx" ON "refinement_proposals" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "refinement_proposals_project_id_scope_status_idx" ON "refinement_proposals" USING btree ("project_id","scope_type","scope_ref","status");--> statement-breakpoint
CREATE INDEX "briefs_project_id_arc_key_idx" ON "briefs" USING btree ("project_id","arc_key");