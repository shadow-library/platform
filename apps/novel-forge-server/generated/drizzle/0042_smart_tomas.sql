ALTER TABLE "canon_facts" ADD COLUMN "writer_note" text;--> statement-breakpoint
-- Seed facts are ideation reader promises, not secrets; their note already reached the drafter and must keep doing so.
UPDATE "canon_facts" SET "writer_note" = "constraint_note" WHERE "source" = 'seed';
