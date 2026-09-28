ALTER TABLE "organisations" ADD COLUMN "is_platform" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "organisations_platform_unique" ON "organisations" USING btree ("is_platform") WHERE "organisations"."is_platform";--> statement-breakpoint
-- Marks the organisation bootstrap created, which until now was found by name alone. A team created through the API always records an
-- `org.created` audit event and bootstrap never does; bootstrap also assigns IAMAdmin in its organisation on every boot. Only a namesake
-- showing both marks of bootstrap and neither of a user is a candidate, and anything but exactly one candidate is left unmarked with a
-- warning: identity then refuses to boot (ADM_002) until an operator sets is_platform on the right row.
DO $$
DECLARE
  candidates bigint[];
BEGIN
  IF EXISTS (SELECT 1 FROM "organisations" WHERE "is_platform") THEN
    RETURN;
  END IF;

  SELECT coalesce(array_agg(o."id" ORDER BY o."id"), '{}') INTO candidates
  FROM "organisations" o
  WHERE o."type" = 'TEAM'
    AND o."name" = 'Shadow Platform'
    AND NOT EXISTS (SELECT 1 FROM "audit_events" e WHERE e."action" = 'org.created' AND e."organisation_id" = o."id"::text)
    AND EXISTS (
      SELECT 1
      FROM "role_assignments" ra
      JOIN "application_roles" r ON r."id" = ra."role_id"
      JOIN "applications" a ON a."id" = r."application_id"
      WHERE ra."organisation_id" = o."id" AND a."name" = 'shadow-identity' AND r."role_name" = 'IAMAdmin'
    );

  IF cardinality(candidates) = 1 THEN
    UPDATE "organisations" SET "is_platform" = true WHERE "id" = candidates[1];
    RAISE NOTICE 'marked organisation % as the platform organisation', candidates[1];
  ELSIF cardinality(candidates) > 1 THEN
    RAISE WARNING 'platform organisation is ambiguous between organisations %; none was marked, set organisations.is_platform by hand', candidates;
  ELSIF EXISTS (SELECT 1 FROM "organisations" WHERE "type" = 'TEAM' AND "name" = 'Shadow Platform') THEN
    RAISE WARNING 'no organisation named Shadow Platform carries bootstrap''s marks; none was marked, set organisations.is_platform by hand';
  END IF;
END $$;
