import { InferEnum, InferSelectModel, relations, sql } from 'drizzle-orm';
import { bigint, bigserial, char, check, cidr, index, inet, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { applications } from './applications.schema';
import { oauthClients } from './oauth.schema';
import { organisations } from './organisations.schema';
import { users } from './users.schema';

export type Bot = InferSelectModel<typeof bots>;

export namespace Bot {
  export type Status = InferEnum<typeof botStatus>;
  export type Key = InferSelectModel<typeof botKeys>;
  export type OwnershipTransfer = InferSelectModel<typeof botOwnershipTransfers>;
  export type OwnershipTransferStatus = InferEnum<typeof botOwnershipTransferStatus>;
}

export const botStatus = pgEnum('bot_status', ['ACTIVE', 'SUSPENDED', 'DELETING', 'DELETED']);
export const botOwnershipTransferStatus = pgEnum('bot_ownership_transfer_status', ['PENDING', 'DONE', 'FAILED']);

export const bots = pgTable(
  'bots',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    organisationId: bigint('organisation_id', { mode: 'bigint' })
      .notNull()
      .references(() => organisations.id, { onDelete: 'cascade' }),
    clientId: varchar('client_id', { length: 64 })
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'restrict' }),
    handle: varchar('handle', { length: 39 }).notNull(),
    displayName: varchar('display_name', { length: 64 }).notNull(),
    description: varchar('description', { length: 280 }),
    status: botStatus('status').notNull().default('ACTIVE'),
    ipAllowlist: cidr('ip_allowlist')
      .array()
      .notNull()
      .default(sql`'{}'::cidr[]`),
    rateLimitPerMinute: integer('rate_limit_per_minute').notNull().default(600),
    createdBy: bigint('created_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    suspendedAt: timestamp('suspended_at', { withTimezone: true }),
    suspendedBy: bigint('suspended_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  t => [
    unique('bots_client_id_unique').on(t.clientId),
    uniqueIndex('bots_organisation_handle_unique').on(t.organisationId, t.handle),
    check('bots_rate_limit_range', sql`${t.rateLimitPerMinute} BETWEEN 1 AND 600`),
  ],
);

export const botKeys = pgTable(
  'bot_keys',
  {
    id: uuid('id').primaryKey(),
    botId: bigint('bot_id', { mode: 'bigint' })
      .notNull()
      .references(() => bots.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 64 }).notNull(),
    keyPrefix: varchar('key_prefix', { length: 16 }).notNull(),
    secretHash: char('secret_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdBy: bigint('created_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    lastUsedIp: inet('last_used_ip'),
    expiryRemindedAt: timestamp('expiry_reminded_at', { withTimezone: true }),
    expiryAuditedAt: timestamp('expiry_audited_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedBy: bigint('revoked_by', { mode: 'bigint' }).references(() => users.id, { onDelete: 'set null' }),
  },
  t => [
    unique('bot_keys_secret_hash_unique').on(t.secretHash),
    index('bot_keys_active_bot_id_idx')
      .on(t.botId)
      .where(sql`${t.revokedAt} IS NULL`),
    index('bot_keys_expiry_reminder_idx')
      .on(t.expiresAt)
      .where(sql`${t.revokedAt} IS NULL AND ${t.expiryRemindedAt} IS NULL`),
    index('bot_keys_expiry_sweep_idx')
      .on(t.expiresAt)
      .where(sql`${t.revokedAt} IS NULL AND ${t.expiryAuditedAt} IS NULL`),
    check('bot_keys_expiry_within_365_days', sql`${t.expiresAt} <= ${t.createdAt} + interval '365 days'`),
  ],
);

export const botOwnershipTransfers = pgTable(
  'bot_ownership_transfers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    botId: bigint('bot_id', { mode: 'bigint' })
      .notNull()
      .references(() => bots.id, { onDelete: 'cascade' }),
    applicationId: integer('application_id')
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),
    toUserId: bigint('to_user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: botOwnershipTransferStatus('status').notNull().default('PENDING'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  t => [unique('bot_ownership_transfers_bot_application_unique').on(t.botId, t.applicationId), index('bot_ownership_transfers_claim_idx').on(t.status, t.nextAttemptAt)],
);

export const botRelations = relations(bots, ({ one, many }) => ({
  organisation: one(organisations, { fields: [bots.organisationId], references: [organisations.id] }),
  client: one(oauthClients, { fields: [bots.clientId], references: [oauthClients.id] }),
  keys: many(botKeys),
  ownershipTransfers: many(botOwnershipTransfers),
}));

export const botKeyRelations = relations(botKeys, ({ one }) => ({
  bot: one(bots, { fields: [botKeys.botId], references: [bots.id] }),
}));

export const botOwnershipTransferRelations = relations(botOwnershipTransfers, ({ one }) => ({
  bot: one(bots, { fields: [botOwnershipTransfers.botId], references: [bots.id] }),
}));
