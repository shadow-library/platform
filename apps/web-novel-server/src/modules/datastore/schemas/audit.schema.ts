/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel } from 'drizzle-orm';
import { bigserial, index, integer, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type PublishAuditLog = InferSelectModel<typeof publishAuditLog>;
export namespace PublishAuditLog {
  export type Outcome = InferEnum<typeof publishOutcome>;
}

/**
 * Declaring the tables
 *
 * Append-only trail of the internal publish surface: exactly one row per mutation call, including
 * every rejected attempt. It carries no foreign keys — audit rows must outlive the novels and
 * chapters they describe (an unpublish or a rebuild must not erase its own history).
 */

export const publishOutcome = pgEnum('publish_outcome', ['applied', 'noop', 'stale_rejected', 'unauthorized', 'error']);

export const publishAuditLog = pgTable(
  'publish_audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /** Verified when the guard admits the caller; decoded unverified (best effort) on rejections */
    callerSub: varchar('caller_sub', { length: 128 }),
    callerClientId: varchar('caller_client_id', { length: 128 }),
    action: varchar('action', { length: 64 }).notNull(),
    novelSlug: varchar('novel_slug', { length: 128 }).notNull(),
    ordinal: integer('ordinal'),
    contentHash: varchar('content_hash', { length: 128 }),
    incomingRevision: integer('incoming_revision'),
    storedRevision: integer('stored_revision'),
    outcome: publishOutcome('outcome').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  table => [index('publish_audit_log_novel_slug_id_idx').on(table.novelSlug, table.id)],
);
