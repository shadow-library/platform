/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel } from 'drizzle-orm';
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type AuditEvent = InferSelectModel<typeof auditEvents>;

export namespace AuditEvent {
  export type ActorType = InferEnum<typeof auditActorType>;
  export type Outcome = InferEnum<typeof auditOutcome>;
}

/**
 * Declaring the constants
 */

export const auditActorType = pgEnum('audit_actor_type', ['USER', 'SERVICE_ACCOUNT', 'SYSTEM', 'ADMIN']);
export const auditOutcome = pgEnum('audit_outcome', ['SUCCESS', 'DENIED', 'FAILURE']);

/**
 * Append-only, hash-chained audit log. It carries no foreign keys: audit records must outlive the
 * rows they describe and must never be mutated. `id` is UUIDv7 so rows sort chronologically, and
 * each row's hash chains to its predecessor within the same organisation (or the global chain).
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    /** varchar, not uuid: organisation ids are bigints until the D-8 UUIDv7 conversion lands, and audit rows must be writable either way. */
    organisationId: varchar('organisation_id', { length: 64 }),
    actorType: auditActorType('actor_type').notNull(),
    actorId: varchar('actor_id', { length: 64 }),
    action: varchar('action', { length: 128 }).notNull(),
    targetType: varchar('target_type', { length: 64 }),
    targetId: varchar('target_id', { length: 64 }),
    outcome: auditOutcome('outcome').notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    correlationId: varchar('correlation_id', { length: 64 }),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    prevHash: text('prev_hash'),
    hash: text('hash').notNull(),
  },
  t => [index('audit_events_organisation_id_id_idx').on(t.organisationId, t.id), index('audit_events_action_id_idx').on(t.action, t.id)],
);
