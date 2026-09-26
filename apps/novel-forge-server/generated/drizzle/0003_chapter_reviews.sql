CREATE TYPE "public"."chapter_review_disposition" AS ENUM('clear', 'issues', 'blocking', 'failed');--> statement-breakpoint
CREATE TYPE "public"."chapter_review_kind" AS ENUM('judge', 'editorial', 'mechanics', 'readability');--> statement-breakpoint
CREATE TYPE "public"."review_remedy_action" AS ENUM('dismissed', 'fixing_myself', 'overridden');--> statement-breakpoint
ALTER TYPE "public"."job_kind" ADD VALUE 'review';--> statement-breakpoint
CREATE TABLE "chapter_review_remedies" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"review_id" bigint NOT NULL,
	"finding_id" varchar NOT NULL,
	"fingerprint" varchar NOT NULL,
	"action" "review_remedy_action" NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "chapter_review_remedies_review_id_finding_id_unique" UNIQUE("review_id","finding_id")
);
--> statement-breakpoint
CREATE TABLE "chapter_reviews" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" bigint NOT NULL,
	"chapter" integer NOT NULL,
	"draft_revision" integer,
	"body_hash" varchar NOT NULL,
	"isolated" boolean DEFAULT false NOT NULL,
	"kind" "chapter_review_kind" NOT NULL,
	"disposition" "chapter_review_disposition" NOT NULL,
	"verdict" varchar,
	"note" text,
	"findings" jsonb NOT NULL,
	"checked" jsonb NOT NULL,
	"brief_compliance" jsonb,
	"readability_compliance" jsonb,
	"ending_compliance" jsonb,
	"knowledge_compliance" jsonb,
	"metrics" jsonb,
	"run_id" uuid,
	"cost_tier" "cost_tier",
	"content_mode" "content_mode",
	"model_provider" varchar,
	"model" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapter_review_remedies" ADD CONSTRAINT "chapter_review_remedies_review_id_chapter_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."chapter_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_reviews" ADD CONSTRAINT "chapter_reviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_reviews" ADD CONSTRAINT "chapter_reviews_run_id_workflow_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chapter_reviews_project_id_chapter_kind_idx" ON "chapter_reviews" USING btree ("project_id","chapter","kind","created_at");--> statement-breakpoint
CREATE INDEX "chapter_reviews_run_id_idx" ON "chapter_reviews" USING btree ("run_id");