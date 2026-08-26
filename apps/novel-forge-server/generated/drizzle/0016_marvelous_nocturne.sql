CREATE TYPE "public"."project_status" AS ENUM('seed', 'active');--> statement-breakpoint
ALTER TYPE "public"."fact_source" ADD VALUE 'seed';--> statement-breakpoint
ALTER TYPE "public"."chat_scope" ADD VALUE 'ideation';--> statement-breakpoint
ALTER TYPE "public"."refinement_kind" ADD VALUE 'ideation';--> statement-breakpoint
CREATE TABLE "story_seeds" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"fields" jsonb,
	"provenance" jsonb,
	"constraints" jsonb,
	"taste_anchors" jsonb,
	"concepts" jsonb,
	"readiness" jsonb,
	"asked_questions" jsonb,
	"revision" integer DEFAULT 1 NOT NULL,
	"content_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "story_seeds_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "status" "project_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "payload" jsonb;--> statement-breakpoint
ALTER TABLE "story_seeds" ADD CONSTRAINT "story_seeds_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;