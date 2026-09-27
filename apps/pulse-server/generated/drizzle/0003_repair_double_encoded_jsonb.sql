-- Drizzle's stock jsonb column stringified each value and Bun SQL's prepared statements JSON-encoded that string again, so these columns hold
-- jsonb string scalars whose text is the real object. A row is unwrapped only when that text parses as a JSON object and casts to jsonb
-- (`IS JSON` accepts \u0000 and lone surrogates, which jsonb rejects); anything else is left untouched.
UPDATE "notification_jobs" SET "payload" = ("payload" #>> '{}')::jsonb
WHERE jsonb_typeof("payload") = 'string' AND ("payload" #>> '{}') IS JSON OBJECT AND pg_input_is_valid("payload" #>> '{}', 'jsonb');--> statement-breakpoint
UPDATE "templates" SET "variable_schema" = ("variable_schema" #>> '{}')::jsonb
WHERE jsonb_typeof("variable_schema") = 'string' AND ("variable_schema" #>> '{}') IS JSON OBJECT AND pg_input_is_valid("variable_schema" #>> '{}', 'jsonb');
