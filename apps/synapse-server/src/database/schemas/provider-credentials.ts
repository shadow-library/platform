import { type InferEnum, type InferInsertModel, type InferSelectModel, sql } from 'drizzle-orm';
import { bigserial, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { jsonb } from './jsonb';

export namespace Credential {
  export type Row = InferSelectModel<typeof providerCredentials>;
  export type NewRow = InferInsertModel<typeof providerCredentials>;
  export type Action = InferEnum<typeof credentialAction>;
  export type Event = InferSelectModel<typeof credentialEvents>;
}

export const credentialAction = pgEnum('credential_action', ['create', 'rotate', 'revoke']);

/** `id` has no default: the app generates it before sealing, because the envelope binds it as AAD. `secret` holds a `@shadow-library/common/crypto` Envelope. */
export const providerCredentials = pgTable(
  'provider_credentials',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull().unique(),
    secret: jsonb('secret').notNull(),
    allowedOrigin: text('allowed_origin').notNull(),
    hint: text('hint').notNull(),
    version: integer('version').notNull().default(1),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  t => [index('provider_credentials_secret_kid_idx').on(sql`(${t.secret}->>'kid')`)],
);

export const credentialEvents = pgTable(
  'credential_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    credentialId: uuid('credential_id')
      .notNull()
      .references(() => providerCredentials.id),
    action: credentialAction('action').notNull(),
    actor: text('actor').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index('credential_events_credential_id_idx').on(t.credentialId, t.at)],
);
