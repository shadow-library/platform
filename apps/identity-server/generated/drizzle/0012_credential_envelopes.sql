ALTER TABLE "identity_providers" ALTER COLUMN "client_secret_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_providers" ALTER COLUMN "client_secret_iv" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_providers" ALTER COLUMN "client_secret_auth_tag" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "signing_keys" ALTER COLUMN "private_key_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "signing_keys" ALTER COLUMN "private_key_iv" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "signing_keys" ALTER COLUMN "private_key_auth_tag" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ALTER COLUMN "secret_ciphertext" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ALTER COLUMN "kek_version" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mfa_enrollments" ADD COLUMN "secret_envelope" jsonb;--> statement-breakpoint
ALTER TABLE "identity_providers" ADD COLUMN "client_secret_envelope" jsonb;--> statement-breakpoint
ALTER TABLE "signing_keys" ADD COLUMN "private_key_envelope" jsonb;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD COLUMN "secret_envelope" jsonb;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD COLUMN "previous_secret_envelope" jsonb;--> statement-breakpoint
-- An image from before this release still writes only the legacy columns while the rollout runs. Rotating a secret there would leave the
-- envelope holding the old value, so the update clears it instead: the reader then falls back to the legacy columns, and the backfill reseals
-- them. The new image never writes a legacy column, so these triggers never fire for it. Dropped with the legacy columns next release.
CREATE FUNCTION "identity_providers_clear_stale_envelope"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."client_secret_ciphertext", NEW."client_secret_iv", NEW."client_secret_auth_tag") IS DISTINCT FROM (OLD."client_secret_ciphertext", OLD."client_secret_iv", OLD."client_secret_auth_tag")
     AND NEW."client_secret_envelope" IS NOT DISTINCT FROM OLD."client_secret_envelope" THEN
    NEW."client_secret_envelope" := NULL;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "identity_providers_clear_stale_envelope" BEFORE UPDATE ON "identity_providers"
FOR EACH ROW EXECUTE FUNCTION "identity_providers_clear_stale_envelope"();--> statement-breakpoint
CREATE FUNCTION "webhook_subscriptions_clear_stale_envelope"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- An old pod's rotation demotes the legacy current secret, which is null on a row the new image created, so the previous ciphertext may not
  -- change at all; the previous envelope is cleared with the current one so it cannot revive under the rotation's fresh expiry.
  IF NEW."secret_ciphertext" IS DISTINCT FROM OLD."secret_ciphertext" AND NEW."secret_envelope" IS NOT DISTINCT FROM OLD."secret_envelope" THEN
    NEW."secret_envelope" := NULL;
    NEW."previous_secret_envelope" := NULL;
  END IF;
  IF NEW."previous_secret_ciphertext" IS DISTINCT FROM OLD."previous_secret_ciphertext"
     AND NEW."previous_secret_envelope" IS NOT DISTINCT FROM OLD."previous_secret_envelope" THEN
    NEW."previous_secret_envelope" := NULL;
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
CREATE TRIGGER "webhook_subscriptions_clear_stale_envelope" BEFORE UPDATE ON "webhook_subscriptions"
FOR EACH ROW EXECUTE FUNCTION "webhook_subscriptions_clear_stale_envelope"();
