ALTER TABLE "ingest_audit_log" ADD COLUMN "actor_kind" "owner_kind";--> statement-breakpoint
ALTER TABLE "ingest_audit_log" ADD COLUMN "actor_id" bigint;--> statement-breakpoint
ALTER TABLE "ingest_audit_log" ADD COLUMN "bot_key_id" uuid;--> statement-breakpoint
-- Hand-added, and ordered ahead of the DROP: an api key acted as its owner, so every pre-cutover row's actor
-- is that owner. A row whose key row is already gone keeps a null actor rather than gaining an invented one,
-- which is why the two actor columns stay nullable.
UPDATE "ingest_audit_log" AS l SET "actor_kind" = 'user', "actor_id" = k."owner_id" FROM "api_keys" AS k WHERE k."id" = l."api_key_id";--> statement-breakpoint
DROP TABLE "api_keys" CASCADE;--> statement-breakpoint
ALTER TABLE "ingest_audit_log" DROP COLUMN "api_key_id";--> statement-breakpoint
-- Hand-added: `projectOwnerColumns` now shares every bot-created project with its organisation, because the
-- ownership guard's sharing branch admits users only and nothing can hand a record to a bot — an unshared
-- bot-owned project is reachable by no person at all. 0036 introduced the columns one task ago, so this can
-- only match rows from that window, but it makes the invariant true of the whole table.
UPDATE "projects" SET "shared_with_org" = true WHERE "owner_kind" = 'bot';
