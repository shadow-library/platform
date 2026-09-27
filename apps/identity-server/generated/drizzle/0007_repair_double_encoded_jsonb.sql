-- Drizzle's stock jsonb column stringified each value and Bun SQL's prepared statements JSON-encoded that string again, so these columns hold
-- jsonb string scalars whose text is the real document. A row is unwrapped only when that text parses as the JSON the column holds and casts
-- to jsonb (`IS JSON` accepts \u0000 and lone surrogates, which jsonb rejects); anything else is left untouched.
-- audit_events.detail is left as recorded evidence, not because of the chain (verifyChain hashes the parsed value), so its tolerant read stays.
UPDATE "signing_keys" SET "public_jwk" = ("public_jwk" #>> '{}')::jsonb
WHERE jsonb_typeof("public_jwk") = 'string' AND ("public_jwk" #>> '{}') IS JSON OBJECT AND pg_input_is_valid("public_jwk" #>> '{}', 'jsonb');--> statement-breakpoint
UPDATE "organisation_policies" SET "policy_value" = ("policy_value" #>> '{}')::jsonb
WHERE jsonb_typeof("policy_value") = 'string' AND ("policy_value" #>> '{}') IS JSON AND ("policy_value" #>> '{}') !~ '^\s*"' AND pg_input_is_valid("policy_value" #>> '{}', 'jsonb');--> statement-breakpoint
UPDATE "notification_outbox" SET "recipients" = ("recipients" #>> '{}')::jsonb
WHERE jsonb_typeof("recipients") = 'string' AND ("recipients" #>> '{}') IS JSON OBJECT AND pg_input_is_valid("recipients" #>> '{}', 'jsonb');--> statement-breakpoint
UPDATE "notification_outbox" SET "payload" = ("payload" #>> '{}')::jsonb
WHERE jsonb_typeof("payload") = 'string' AND ("payload" #>> '{}') IS JSON OBJECT AND pg_input_is_valid("payload" #>> '{}', 'jsonb');
