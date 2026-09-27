-- Two raw writes bound JSON text as `$1::jsonb`, which Bun SQL's prepared statements JSON-encoded again into a jsonb string scalar. Replacing
-- a project's config concatenated that scalar with the kept settings, leaving an array of the config's JSON text followed by objects; saving
-- the finalize-review auto-keep list left it as a string scalar inside the config. Only rows of exactly those shapes, whose text parses as the
-- JSON expected and casts to jsonb (`IS JSON` accepts \u0000 and lone surrogates, which jsonb rejects), are rewritten. Every cast and
-- set-returning call is guarded on its own, so no plan can evaluate one on a row it would reject.
UPDATE "projects" AS p SET "config" = repaired."config"
FROM (
  SELECT source."id", coalesce(jsonb_object_agg(entry.key, entry.value ORDER BY part.ord) FILTER (WHERE entry.key IS NOT NULL), '{}'::jsonb) AS "config"
  FROM "projects" AS source
  CROSS JOIN LATERAL (
    SELECT element.ord,
      CASE
        WHEN element.ord = 1 AND jsonb_typeof(element.value) = 'string' AND (element.value #>> '{}') IS JSON OBJECT AND pg_input_is_valid(element.value #>> '{}', 'jsonb')
        THEN (element.value #>> '{}')::jsonb
        ELSE element.value
      END AS document
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(source."config") = 'array' THEN source."config" ELSE '[]'::jsonb END) WITH ORDINALITY AS element(value, ord)
  ) AS part
  LEFT JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(part.document) = 'object' THEN part.document ELSE '{}'::jsonb END) AS entry ON true
  WHERE jsonb_typeof(source."config") = 'array'
    AND jsonb_typeof(source."config" -> 0) = 'string'
    AND (source."config" ->> 0) IS JSON OBJECT
    AND pg_input_is_valid(source."config" ->> 0, 'jsonb')
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(source."config") = 'array' THEN source."config" ELSE '[]'::jsonb END) WITH ORDINALITY AS rest(value, ord)
      WHERE rest.ord > 1 AND jsonb_typeof(rest.value) <> 'object'
    )
  GROUP BY source."id"
) AS repaired
WHERE p."id" = repaired."id";--> statement-breakpoint
UPDATE "projects" SET "config" = ("config" #>> '{}')::jsonb
WHERE jsonb_typeof("config") = 'string' AND ("config" #>> '{}') IS JSON OBJECT AND pg_input_is_valid("config" #>> '{}', 'jsonb');--> statement-breakpoint
UPDATE "projects" SET "config" = jsonb_set("config", '{finalizeReview,autoKeep}', ("config" #>> '{finalizeReview,autoKeep}')::jsonb)
WHERE jsonb_typeof("config" #> '{finalizeReview,autoKeep}') = 'string'
  AND ("config" #>> '{finalizeReview,autoKeep}') IS JSON ARRAY
  AND pg_input_is_valid("config" #>> '{finalizeReview,autoKeep}', 'jsonb');
