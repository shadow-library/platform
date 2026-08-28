ALTER TABLE "novels" ADD COLUMN "tags" varchar(64)[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "novels" ADD COLUMN "sexual_content" varchar(16);--> statement-breakpoint
ALTER TABLE "novels" ADD COLUMN "violence" varchar(16);--> statement-breakpoint
ALTER TABLE "novels" ADD COLUMN "dark_content" varchar(16);--> statement-breakpoint
-- One-off forensic record of the free-text genres the backfill below deletes; outside the Drizzle schema, so inspect it and DROP it by hand once the deployment is confirmed clean.
CREATE TABLE IF NOT EXISTS "migration_0006_dropped_genres" (
  "novel_id" bigint NOT NULL,
  "original_genres" varchar(64)[] NOT NULL,
  "dropped_genres" varchar(64)[] NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$
DECLARE
  vocabulary text[] := ARRAY[
    'Action', 'Adult', 'Adventure', 'Comedy', 'Drama', 'Ecchi', 'Fantasy', 'Gender Bender', 'Harem', 'Historical', 'Horror', 'Josei', 'Martial Arts', 'Mature', 'Mecha',
    'Mystery', 'Psychological', 'Romance', 'School Life', 'Sci-fi', 'Seinen', 'Shoujo', 'Shoujo Ai', 'Shounen', 'Shounen Ai', 'Slice of Life', 'Smut', 'Sports',
    'Supernatural', 'Tragedy', 'Wuxia', 'Xianxia', 'Xuanhuan', 'Yaoi', 'Yuri'
  ];
BEGIN
  INSERT INTO "migration_0006_dropped_genres" ("novel_id", "original_genres", "dropped_genres")
  SELECT n."id", n."genres", d.dropped
    FROM "novels" n
    CROSS JOIN LATERAL (
      SELECT array_agg(g.value ORDER BY g.ord) AS dropped
        FROM unnest(n."genres") WITH ORDINALITY AS g(value, ord)
       WHERE lower(g.value) <> ALL (SELECT lower(v.value) FROM unnest(vocabulary) AS v(value))
    ) AS d
   WHERE d.dropped IS NOT NULL;

  UPDATE "novels" n
     SET "genres" = COALESCE((
           SELECT array_agg(c.canonical ORDER BY c.position)
             FROM (SELECT v.value AS canonical, min(g.ord) AS position
                     FROM unnest(n."genres") WITH ORDINALITY AS g(value, ord)
                     JOIN unnest(vocabulary) AS v(value) ON lower(v.value) = lower(g.value)
                    GROUP BY v.value) AS c
         ), '{}')
   WHERE n."genres" <> '{}';
END $$;
