DROP INDEX "refinement_proposals_job_card_run_id_unique";--> statement-breakpoint
ALTER TABLE "refinement_proposals" ADD COLUMN "organise_record" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "refinement_proposals_job_card_run_id_unique" ON "refinement_proposals" USING btree ("run_id") WHERE "refinement_proposals"."kind" in ('organise', 'chapter_plan') and "refinement_proposals"."auto_applied" = false and "refinement_proposals"."status" <> 'discarded';--> statement-breakpoint
UPDATE "refinement_proposals" SET "organise_record" = '{"legacy": true}'::jsonb WHERE "kind"::text = 'organise';
