ALTER TYPE "public"."finalize_review_category" ADD VALUE 'summary';--> statement-breakpoint
ALTER TABLE "finalize_reviews" DROP CONSTRAINT "finalize_reviews_project_id_chapter_revision_unique";--> statement-breakpoint
ALTER TABLE "finalize_reviews" ADD COLUMN "bridge_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "finalize_reviews_project_id_chapter_revision_unique" ON "finalize_reviews" USING btree ("project_id","chapter","draft_revision") WHERE "finalize_reviews"."bridge_only" = false;