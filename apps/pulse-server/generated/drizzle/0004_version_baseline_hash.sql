ALTER TABLE "layout_versions" ADD COLUMN "baseline_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "partial_versions" ADD COLUMN "baseline_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "template_versions" ADD COLUMN "baseline_hash" varchar(64);--> statement-breakpoint
-- The seed wrote every version it created as v1, PUBLISHED, noted 'Baseline', with no editor; an operator's publish or rollback is always a
-- later version. Marking those still PUBLISHED lets the seed supersede them when its fixture has changed; anything else stays operator-owned.
UPDATE "layout_versions" SET "baseline_hash" = 'legacy'
WHERE "status" = 'PUBLISHED' AND "version" = 1 AND "notes" = 'Baseline' AND "edited_by" IS NULL AND "baseline_hash" IS NULL;--> statement-breakpoint
UPDATE "partial_versions" SET "baseline_hash" = 'legacy'
WHERE "status" = 'PUBLISHED' AND "version" = 1 AND "notes" = 'Baseline' AND "edited_by" IS NULL AND "baseline_hash" IS NULL;--> statement-breakpoint
UPDATE "template_versions" SET "baseline_hash" = 'legacy'
WHERE "status" = 'PUBLISHED' AND "version" = 1 AND "notes" = 'Baseline' AND "edited_by" IS NULL AND "baseline_hash" IS NULL;
