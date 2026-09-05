-- Detach any pre-existing (provider, provider_ref) collision so the partial unique index below cannot fail on
-- create: keep the most-recently-applied binding, null the losers' provider/provider_ref (never deleting the
-- entitlement row). Idempotent — after it runs each bound pair belongs to exactly one account.
UPDATE "entitlements" AS e
SET "provider" = NULL, "provider_ref" = NULL
WHERE e."provider" IS NOT NULL
	AND e."provider_ref" IS NOT NULL
	AND e."account_id" <> (
		SELECT keep."account_id"
		FROM "entitlements" AS keep
		WHERE keep."provider" = e."provider"
			AND keep."provider_ref" = e."provider_ref"
		ORDER BY keep."applied_event_at" DESC NULLS LAST, keep."account_id" DESC
		LIMIT 1
	);
--> statement-breakpoint
CREATE UNIQUE INDEX "entitlements_provider_provider_ref_unique" ON "entitlements" USING btree ("provider","provider_ref") WHERE "entitlements"."provider" IS NOT NULL AND "entitlements"."provider_ref" IS NOT NULL;
