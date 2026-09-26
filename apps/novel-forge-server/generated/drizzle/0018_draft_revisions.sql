CREATE TYPE "public"."passage_suggestion_status" AS ENUM('open', 'applied', 'dismissed');--> statement-breakpoint
ALTER TYPE "public"."draft_revision_source" ADD VALUE 'restored';--> statement-breakpoint
ALTER TYPE "public"."draft_revision_source" ADD VALUE 'passage_rewritten';--> statement-breakpoint
ALTER TYPE "public"."writer_attempt_role" ADD VALUE 'passage';--> statement-breakpoint
CREATE TABLE "passage_suggestions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"draft_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"base_revision" integer NOT NULL,
	"base_save_seq" integer NOT NULL,
	"anchor_start" integer NOT NULL,
	"anchor_end" integer NOT NULL,
	"passage_hash" varchar(64) NOT NULL,
	"passage" text NOT NULL,
	"context_before" text NOT NULL,
	"context_after" text NOT NULL,
	"isolated" boolean DEFAULT false NOT NULL,
	"request" text NOT NULL,
	"replacement" text NOT NULL,
	"leak_lines" jsonb,
	"status" "passage_suggestion_status" DEFAULT 'open' NOT NULL,
	"applied_revision" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "draft_revisions" ADD COLUMN "title" varchar(500);--> statement-breakpoint
ALTER TABLE "draft_revisions" ADD COLUMN "isolated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "draft_revisions" ADD COLUMN "restored_from" integer;--> statement-breakpoint
ALTER TABLE "passage_suggestions" ADD CONSTRAINT "passage_suggestions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_suggestions" ADD CONSTRAINT "passage_suggestions_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passage_suggestions_draft_id_idx" ON "passage_suggestions" USING btree ("draft_id");--> statement-breakpoint
-- History written before revisions recorded their own isolation is walled off wherever anything says it was isolated: the draft now, an unrestricted
-- writer, or a review or writer snapshot of that revision. Walling off too much is the safe error.
UPDATE "draft_revisions" SET "isolated" = true FROM "drafts" WHERE "draft_revisions"."draft_id" = "drafts"."id" AND ("drafts"."isolated" = true OR "drafts"."generator" = 'unrestricted' OR EXISTS (SELECT 1 FROM "chapter_reviews" WHERE "chapter_reviews"."project_id" = "drafts"."project_id" AND "chapter_reviews"."chapter" = "drafts"."chapter" AND "chapter_reviews"."draft_revision" = "draft_revisions"."revision" AND "chapter_reviews"."isolated" = true) OR EXISTS (SELECT 1 FROM "writer_snapshots" WHERE "writer_snapshots"."project_id" = "drafts"."project_id" AND "writer_snapshots"."chapter" = "drafts"."chapter" AND "writer_snapshots"."draft_revision" = "draft_revisions"."revision" AND "writer_snapshots"."isolated" = true));
