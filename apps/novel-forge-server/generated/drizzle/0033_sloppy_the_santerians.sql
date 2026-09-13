ALTER TABLE "illustrations" ADD COLUMN "references" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
-- Backfills `referenceRefs: []` onto every existing candidate element that predates the field, so
-- Illustration.Candidate.referenceRefs can stay a required string[] instead of forcing every reader to
-- fall back on a missing key. Idempotent: the WHERE EXISTS guard (and thus the UPDATE) is a no-op once
-- every element already carries the key, and jsonb_array_elements over an empty `candidates` array never
-- matches, so no row's `candidates` is ever replaced with a null aggregate.
UPDATE "illustrations"
SET "candidates" = (
  SELECT jsonb_agg(
    CASE WHEN elem ? 'referenceRefs' THEN elem ELSE elem || jsonb_build_object('referenceRefs', '[]'::jsonb) END
    ORDER BY ord
  )
  FROM jsonb_array_elements("candidates") WITH ORDINALITY AS t(elem, ord)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements("candidates") e WHERE NOT (e ? 'referenceRefs')
);