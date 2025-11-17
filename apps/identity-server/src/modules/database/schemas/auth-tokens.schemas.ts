/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { applications } from './applications.schema';
import { userAuthIdentities, users } from './users.schema';

/**
 * Defining types
 */

export type UserSession = InferSelectModel<typeof userSessions>;

export namespace UserSession {
  export type Status = InferEnum<typeof sessionStatus>;

  export type Token = InferSelectModel<typeof userSessionTokens>;
  export type SignInEvent = InferSelectModel<typeof userSignInEvents>;
}

/**
 * Declaring the constants
 */

export const sessionStatus = pgEnum('session_status', ['ACTIVE', 'REVOKED', 'TERMINATED']);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userAuthIdentityId: bigint('user_auth_identity_id', { mode: 'bigint' }).references(() => userAuthIdentities.id, { onDelete: 'set null' }),

    status: sessionStatus('status').notNull().default('ACTIVE'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    lastUsedAt: timestamp('last_used_at').notNull().defaultNow(),
    terminatedAt: timestamp('terminated_at'),
    elevatedUntil: timestamp('elevated_until'),

    deviceId: varchar('device_id', { length: 255 }),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
    ipCountry: varchar('ip_country', { length: 2 }),
  },
  t => [index('user_sessions_user_id_status_idx').on(t.userId, t.status)],
);

export const userSessionTokens = pgTable(
  'user_session_tokens',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    sessionId: bigint('session_id', { mode: 'bigint' })
      .notNull()
      .references(() => userSessions.id, { onDelete: 'cascade' }),
    applicationId: bigint('application_id', { mode: 'bigint' })
      .notNull()
      .references(() => applications.id, { onDelete: 'cascade' }),

    tokenHash: varchar('token_hash', { length: 512 }).notNull(),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),

    ipAddress: varchar('ip_address', { length: 45 }),
    ipCountry: varchar('ip_country', { length: 2 }),
    previousTokenId: bigint('previous_token_id', { mode: 'bigint' }),
  },
  t => [unique('user_session_tokens_session_id_application_id_unique').on(t.sessionId, t.applicationId), unique('user_session_tokens_token_hash_unique').on(t.tokenHash)],
);

export const userSignInEvents = pgTable(
  'user_sign_in_events',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userAuthIdentityId: bigint('user_auth_identity_id', { mode: 'bigint' }).references(() => userAuthIdentities.id, { onDelete: 'set null' }),
    sessionId: bigint('session_id', { mode: 'bigint' }).references(() => userSessions.id, { onDelete: 'set null' }),

    successful: boolean('successful').notNull().default(false),
    failureReason: varchar('failure_reason', { length: 255 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),

    ipAddress: varchar('ip_address', { length: 45 }),
    ipCountry: varchar('ip_country', { length: 2 }),
    userAgent: text('user_agent'),
  },
  t => [index('user_sign_in_events_user_id_created_at_idx').on(t.userId, t.createdAt)],
);

/**
 * Declaring the relations
 */

export const userSessionRelations = relations(userSessions, ({ many, one }) => ({
  tokens: many(userSessionTokens),
  user: one(users, { fields: [userSessions.userId], references: [users.id] }),
  authIdentity: one(userAuthIdentities, { fields: [userSessions.userAuthIdentityId], references: [userAuthIdentities.id] }),
}));

export const userSessionTokenRelations = relations(userSessionTokens, ({ one }) => ({
  session: one(userSessions, { fields: [userSessionTokens.sessionId], references: [userSessions.id] }),
  application: one(applications, { fields: [userSessionTokens.applicationId], references: [applications.id] }),
}));

export const userSignInEventRelations = relations(userSignInEvents, ({ one }) => ({
  user: one(users, { fields: [userSignInEvents.userId], references: [users.id] }),
  authIdentity: one(userAuthIdentities, { fields: [userSignInEvents.userAuthIdentityId], references: [userAuthIdentities.id] }),
  session: one(userSessions, { fields: [userSignInEvents.sessionId], references: [userSessions.id] }),
}));
