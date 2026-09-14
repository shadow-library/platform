import { bigint, bigserial, index, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { ownerKind } from './owner';

/**
 * Append-only trail of the curated-ingest surface: one row per mutation attempt, rejections included, so a
 * scraper's behaviour can be reconstructed after the fact. It carries no foreign keys — a row must outlive
 * the project it names, and `sourceRef` stays meaningful even when nothing was created.
 *
 * `actorKind`/`actorId` name the caller the way every other record here is owned, and `botKeyId` the bot key
 * it presented: identity samples `bot.key.used` to one event an hour, so this is the only per-request record
 * of which key of a rotating pair did the work. Both actor columns are nullable only for rows written before
 * the bot cutover, whose caller was an API key whose owner row may no longer exist to backfill from.
 */
export const ingestAuditLog = pgTable(
  'ingest_audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    actorKind: ownerKind('actor_kind'),
    actorId: bigint('actor_id', { mode: 'bigint' }),
    botKeyId: uuid('bot_key_id'),
    action: varchar('action', { length: 64 }).notNull(),
    sourceRef: varchar('source_ref', { length: 64 }).notNull(),
    projectId: bigint('project_id', { mode: 'bigint' }),
    outcome: varchar('outcome', { length: 32 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  t => [index('ingest_audit_log_source_ref_id_idx').on(t.sourceRef, t.id)],
);
