ALTER TABLE "reading_progress" ADD COLUMN "furthest_ordinal" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Backfill: existing rows have no reread history yet, so the current position is the furthest reached so far.
UPDATE "reading_progress" SET "furthest_ordinal" = "ordinal";