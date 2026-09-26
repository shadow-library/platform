-- One 'state' event per character_states row (its current, most-recently-updated chapter only — the table keeps
-- no earlier history to replay) and one 'appearance' event per entity_appearances row. The unique constraint on
-- character_events makes every insert idempotent, so re-running this against a database that already has
-- continuity-written events for these chapters changes nothing.
INSERT INTO "character_events" ("project_id", "entity_id", "chapter", "kind", "detail_key", "before", "after", "source", "status")
SELECT
	cs.project_id,
	e.id,
	cs.last_updated_chapter,
	'state',
	'',
	NULL,
	jsonb_build_object('location', cs.location, 'conditions', cs.conditions, 'immediateGoal', cs.immediate_goal, 'statusNote', cs.status_note),
	'backfill',
	'committed'
FROM "character_states" cs
JOIN "entities" e ON e.project_id = cs.project_id AND e.entity_key = cs.entity_key
ON CONFLICT ("project_id", "entity_id", "chapter", "kind", "detail_key") DO NOTHING;--> statement-breakpoint
INSERT INTO "character_events" ("project_id", "entity_id", "chapter", "kind", "detail_key", "before", "after", "source", "status")
SELECT
	ea.project_id,
	ea.entity_id,
	ea.chapter,
	'appearance',
	'',
	NULL,
	jsonb_build_object('seenChapters', ea.seen_chapters),
	'backfill',
	'committed'
FROM "entity_appearances" ea
ON CONFLICT ("project_id", "entity_id", "chapter", "kind", "detail_key") DO NOTHING;
