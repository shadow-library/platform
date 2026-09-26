CREATE TYPE "public"."writer_attempt_role" AS ENUM('draft', 'repair', 'rewrite', 'revise');--> statement-breakpoint
CREATE TABLE "writer_snapshots" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"draft_revision" integer NOT NULL,
	"attempt" integer NOT NULL,
	"role" "writer_attempt_role" NOT NULL,
	"context_pack_id" bigint,
	"messages" jsonb NOT NULL,
	"kept_back" jsonb,
	"plan_revision" integer,
	"bible_hash" varchar,
	"prompt_key" varchar NOT NULL,
	"prompt_version" varchar NOT NULL,
	"model_route" jsonb NOT NULL,
	"isolated" boolean DEFAULT false NOT NULL,
	"run_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "writer_snapshots" ADD CONSTRAINT "writer_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "writer_snapshots_project_id_chapter_idx" ON "writer_snapshots" USING btree ("project_id","chapter");--> statement-breakpoint
CREATE INDEX "writer_snapshots_project_id_chapter_draft_revision_idx" ON "writer_snapshots" USING btree ("project_id","chapter","draft_revision");