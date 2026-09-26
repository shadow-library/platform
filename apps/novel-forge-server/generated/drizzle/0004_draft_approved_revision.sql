ALTER TABLE "drafts" ADD COLUMN "save_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "drafts" ADD COLUMN "approved_revision" integer;--> statement-breakpoint
UPDATE "drafts" SET "approved_revision" = "revision" WHERE "review_status" IN ('approved', 'final');
