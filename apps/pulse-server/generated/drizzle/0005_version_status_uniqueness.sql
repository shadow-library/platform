-- Nothing enforced one DRAFT and one PUBLISHED version per item before these indexes, so duplicates left by concurrent publishes are archived first, keeping the
-- highest version of each. The lock keeps an old replica from writing a fresh duplicate between the archive and the index build; the timeout fails the migration
-- (to be retried) rather than queueing every reader and writer behind a lock stuck waiting on a long transaction.
SET LOCAL lock_timeout = '10s';--> statement-breakpoint
LOCK TABLE "template_versions", "layout_versions", "partial_versions" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
UPDATE "template_versions" AS "stale" SET "status" = 'ARCHIVED', "updated_at" = now()
WHERE "stale"."status" IN ('DRAFT', 'PUBLISHED') AND EXISTS (
  SELECT 1 FROM "template_versions" AS "newer"
  WHERE "newer"."template_id" = "stale"."template_id" AND "newer"."status" = "stale"."status" AND "newer"."version" > "stale"."version"
);--> statement-breakpoint
UPDATE "layout_versions" AS "stale" SET "status" = 'ARCHIVED', "updated_at" = now()
WHERE "stale"."status" IN ('DRAFT', 'PUBLISHED') AND EXISTS (
  SELECT 1 FROM "layout_versions" AS "newer"
  WHERE "newer"."layout_id" = "stale"."layout_id" AND "newer"."status" = "stale"."status" AND "newer"."version" > "stale"."version"
);--> statement-breakpoint
UPDATE "partial_versions" AS "stale" SET "status" = 'ARCHIVED', "updated_at" = now()
WHERE "stale"."status" IN ('DRAFT', 'PUBLISHED') AND EXISTS (
  SELECT 1 FROM "partial_versions" AS "newer"
  WHERE "newer"."partial_id" = "stale"."partial_id" AND "newer"."status" = "stale"."status" AND "newer"."version" > "stale"."version"
);--> statement-breakpoint
CREATE UNIQUE INDEX "layout_versions_layout_id_draft_unique" ON "layout_versions" USING btree ("layout_id") WHERE "layout_versions"."status" = 'DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX "layout_versions_layout_id_published_unique" ON "layout_versions" USING btree ("layout_id") WHERE "layout_versions"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE UNIQUE INDEX "partial_versions_partial_id_draft_unique" ON "partial_versions" USING btree ("partial_id") WHERE "partial_versions"."status" = 'DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX "partial_versions_partial_id_published_unique" ON "partial_versions" USING btree ("partial_id") WHERE "partial_versions"."status" = 'PUBLISHED';--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_template_id_draft_unique" ON "template_versions" USING btree ("template_id") WHERE "template_versions"."status" = 'DRAFT';--> statement-breakpoint
CREATE UNIQUE INDEX "template_versions_template_id_published_unique" ON "template_versions" USING btree ("template_id") WHERE "template_versions"."status" = 'PUBLISHED';--> statement-breakpoint
SET LOCAL lock_timeout = DEFAULT;