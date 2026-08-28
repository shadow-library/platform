-- Fails, by design, on any row still carrying source_ref IS NULL: such a row is reachable only by slug,
-- and the publish surface no longer resolves that way. Every publisher must reconcile ALL of its
-- publications against the previous release — which still adopted a ref-less row at its slug — before
-- this migration is applied.
ALTER TABLE "novels" ALTER COLUMN "source_ref" SET NOT NULL;