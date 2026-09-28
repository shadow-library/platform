ALTER TABLE "layout_versions" ADD COLUMN "baseline_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "partial_versions" ADD COLUMN "baseline_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "template_versions" ADD COLUMN "baseline_hash" varchar(64);--> statement-breakpoint
-- The old seed wrote every version it created as v1 with notes 'Baseline', published in the same statement that created it. An operator's
-- publish of a seeded item is always v2 or later, and a draft is published well after it was created. edited_by carries no signal (no
-- controller sets it) and is kept only so a future attributed edit can never match. Marking those still PUBLISHED lets the seed supersede
-- them when its fixture has changed; anything else stays operator-owned.
UPDATE "layout_versions" SET "baseline_hash" = 'legacy'
WHERE "status" = 'PUBLISHED' AND "version" = 1 AND "notes" = 'Baseline' AND "edited_by" IS NULL AND "baseline_hash" IS NULL
  AND "published_at" - "created_at" < interval '1 minute';--> statement-breakpoint
UPDATE "partial_versions" SET "baseline_hash" = 'legacy'
WHERE "status" = 'PUBLISHED' AND "version" = 1 AND "notes" = 'Baseline' AND "edited_by" IS NULL AND "baseline_hash" IS NULL
  AND "published_at" - "created_at" < interval '1 minute';--> statement-breakpoint
UPDATE "template_versions" SET "baseline_hash" = 'legacy'
WHERE "status" = 'PUBLISHED' AND "version" = 1 AND "notes" = 'Baseline' AND "edited_by" IS NULL AND "baseline_hash" IS NULL
  AND "published_at" - "created_at" < interval '1 minute';
