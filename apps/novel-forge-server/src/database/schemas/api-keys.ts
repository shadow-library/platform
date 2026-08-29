import { InferSelectModel } from 'drizzle-orm';
import { bigint, bigserial, char, index, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export namespace ApiKey {
  export type Row = InferSelectModel<typeof apiKeys>;
}

/**
 * Long-lived credentials for the external ingest tooling. Only the sha256 of the secret is stored, so
 * a database disclosure yields nothing presentable — `keyPrefix` exists purely so a person can tell
 * their keys apart in a list. `ownerId`/`ownerOrgId` freeze the identity subject and organisation the
 * key acts as; every request re-checks that owner against the PDP, because a key must not outlive the
 * entitlement it was minted under. Revocation is a tombstone, never a delete, so an audit of past use
 * still names the credential.
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 8 }).notNull(),
    keyHash: char('key_hash', { length: 64 }).notNull().unique(),
    ownerId: bigint('owner_id', { mode: 'bigint' }).notNull(),
    ownerOrgId: varchar('owner_org_id', { length: 64 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at'),
    revokedAt: timestamp('revoked_at'),
  },
  t => [index('api_keys_owner_id_idx').on(t.ownerId)],
);
