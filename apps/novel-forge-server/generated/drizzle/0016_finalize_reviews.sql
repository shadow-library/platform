CREATE TYPE "public"."finalize_review_basis" AS ENUM('observed', 'inferred');--> statement-breakpoint
CREATE TYPE "public"."finalize_review_category" AS ENUM('entity', 'appearance', 'character_state', 'relationship', 'promise', 'knowledge', 'milestone');--> statement-breakpoint
CREATE TYPE "public"."finalize_review_decision" AS ENUM('kept', 'edited', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."finalize_review_flag" AS ENUM('missed_milestone', 'unclaimed_milestone', 'unplanned_disclosure');--> statement-breakpoint
CREATE TYPE "public"."finalize_review_status" AS ENUM('preparing', 'ready', 'failed', 'applied', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."finalize_review_triage" AS ENUM('consequential', 'routine');--> statement-breakpoint
ALTER TYPE "public"."job_kind" ADD VALUE 'finalize_review';--> statement-breakpoint
CREATE TABLE "finalize_review_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"review_id" bigint NOT NULL,
	"item_key" varchar NOT NULL,
	"position" integer NOT NULL,
	"category" "finalize_review_category" NOT NULL,
	"triage" "finalize_review_triage" NOT NULL,
	"basis" "finalize_review_basis" NOT NULL,
	"subject_key" varchar NOT NULL,
	"claim" text NOT NULL,
	"evidence" text,
	"proposed" jsonb NOT NULL,
	"edited" jsonb,
	"flag" "finalize_review_flag",
	"dependents" jsonb,
	"decision" "finalize_review_decision",
	"reason" text,
	"auto_kept" boolean DEFAULT false NOT NULL,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finalize_review_items_review_id_item_key_unique" UNIQUE("review_id","item_key")
);
--> statement-breakpoint
CREATE TABLE "finalize_reviews" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"draft_id" bigint,
	"draft_revision" integer NOT NULL,
	"source_hash" varchar NOT NULL,
	"plan_hash" varchar,
	"isolated" boolean DEFAULT false NOT NULL,
	"status" "finalize_review_status" DEFAULT 'preparing' NOT NULL,
	"job_id" uuid,
	"error" text,
	"applied" jsonb,
	"applied_at" timestamp,
	"reverted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finalize_reviews_project_id_chapter_revision_unique" UNIQUE("project_id","chapter","draft_revision")
);
--> statement-breakpoint
ALTER TABLE "finalize_review_items" ADD CONSTRAINT "finalize_review_items_review_id_finalize_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."finalize_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finalize_reviews" ADD CONSTRAINT "finalize_reviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finalize_reviews" ADD CONSTRAINT "finalize_reviews_draft_id_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finalize_reviews" ADD CONSTRAINT "finalize_reviews_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finalize_reviews_draft_id_idx" ON "finalize_reviews" USING btree ("draft_id");