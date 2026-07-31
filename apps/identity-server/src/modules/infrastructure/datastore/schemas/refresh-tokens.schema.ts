/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations, sql } from 'drizzle-orm';
import { bigint, index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { userSessions } from './auth-tokens.schemas';
import { users } from './users.schema';

/**
 * Defining types
 */

export type RefreshTokenFamily = InferSelectModel<typeof refreshTokenFamilies>;
export type RefreshToken = InferSelectModel<typeof refreshTokens>;

export namespace RefreshToken {
  export type Status = InferEnum<typeof refreshTokenStatus>;
  export type FamilyStatus = InferEnum<typeof refreshFamilyStatus>;
  export type RevokeReason = InferEnum<typeof refreshRevokeReason>;
}

/**
 * Declaring the constants
 */

export const refreshFamilyStatus = pgEnum('refresh_family_status', ['ACTIVE', 'REVOKED']);
export const refreshRevokeReason = pgEnum('refresh_revoke_reason', ['ROTATION_REUSE', 'LOGOUT', 'ADMIN', 'EXPIRY']);
export const refreshTokenStatus = pgEnum('refresh_token_status', ['ACTIVE', 'ROTATED', 'REVOKED']);

/**
 * A refresh-token family groups the rotation chain issued to one client for one session. Presenting
 * any superseded member is treated as theft: the whole family (and its session) is revoked (D-11).
 */
export const refreshTokenFamilies = pgTable(
  'refresh_token_families',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sessionId: bigint('session_id', { mode: 'bigint' }).references(() => userSessions.id, { onDelete: 'set null' }),
    clientId: varchar('client_id', { length: 64 }),
    scope: text('scope'),
    audience: varchar('audience', { length: 255 }),
    organisationId: bigint('organisation_id', { mode: 'bigint' }),
    status: refreshFamilyStatus('status').notNull().default('ACTIVE'),
    revokeReason: refreshRevokeReason('revoke_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  t => [index('refresh_token_families_user_id_status_idx').on(t.userId, t.status), index('refresh_token_families_session_id_idx').on(t.sessionId)],
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => refreshTokenFamilies.id, { onDelete: 'cascade' }),
    tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
    status: refreshTokenStatus('status').notNull().default('ACTIVE'),
    previousTokenId: uuid('previous_token_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
    ipAddress: varchar('ip_address', { length: 45 }),
    ipCountry: varchar('ip_country', { length: 2 }),
  },
  t => [
    uniqueIndex('refresh_tokens_family_active_idx')
      .on(t.familyId)
      .where(sql`status = 'ACTIVE'`),
    index('refresh_tokens_family_id_idx').on(t.familyId),
  ],
);

/**
 * Declaring the relations
 */

export const refreshTokenFamilyRelations = relations(refreshTokenFamilies, ({ many, one }) => ({
  tokens: many(refreshTokens),
  user: one(users, { fields: [refreshTokenFamilies.userId], references: [users.id] }),
  session: one(userSessions, { fields: [refreshTokenFamilies.sessionId], references: [userSessions.id] }),
}));

export const refreshTokenRelations = relations(refreshTokens, ({ one }) => ({
  family: one(refreshTokenFamilies, { fields: [refreshTokens.familyId], references: [refreshTokenFamilies.id] }),
}));
