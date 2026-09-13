-- Backfills `references: []` onto every existing candidate element that predates the per-candidate reference
-- snapshot, so Illustration.Candidate.references can stay required. Idempotent in the same way as 0033: the
-- WHERE EXISTS guard makes the UPDATE a no-op once every element carries the key, and an empty `candidates`
-- array never matches, so no row's `candidates` is replaced with a null aggregate.
UPDATE "illustrations"
SET "candidates" = (
  SELECT jsonb_agg(
    CASE WHEN elem ? 'references' THEN elem ELSE elem || jsonb_build_object('references', '[]'::jsonb) END
    ORDER BY ord
  )
  FROM jsonb_array_elements("candidates") WITH ORDINALITY AS t(elem, ord)
)
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements("candidates") e WHERE NOT (e ? 'references')
);
