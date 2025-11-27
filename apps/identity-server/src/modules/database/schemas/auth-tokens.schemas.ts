/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, pgEnum, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { applications } from './applications.schema';
import { userAuthProvider, users } from './users.schema';

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
export const signInStatus = pgEnum('sign_in_status', ['SUCCESS', 'INVALID_CREDENTIALS', 'MFA_FAILED', 'ACCOUNT_LOCKED', 'FAILED']);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userSignInEventId: uuid('user_sign_in_event_id')
      .notNull()
      .references(() => userSignInEvents.id, { onDelete: 'restrict' }),

    status: sessionStatus('status').notNull().default('ACTIVE'),
    expiresAt: timestamp('expires_at').notNull(),
    terminatedAt: timestamp('terminated_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at').notNull().defaultNow(),
    elevatedUntil: timestamp('elevated_until'),
  },
  t => [index('user_sessions_user_id_status_idx').on(t.userId, t.status)],
);

export const userSessionTokens = pgTable(
  'user_session_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sessionId: bigint('session_id', { mode: 'bigint' })
      .notNull()
      .references(() => userSessions.id, { onDelete: 'cascade' }),
    applicationId: bigint('application_id', { mode: 'bigint' })
      .notNull()
      .references(() => applications.id, { onDelete: 'restrict' }),

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
    id: uuid('id').primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    identifier: varchar('identifier', { length: 255 }).notNull(),
    status: signInStatus('status').notNull(),
    authModeUsed: userAuthProvider('auth_mode_used').notNull(),
    mfaModeUsed: userAuthProvider('mfa_mode_used'),

    createdAt: timestamp('created_at').notNull().defaultNow(),

    deviceId: varchar('device_id', { length: 255 }),
    ipAddress: varchar('ip_address', { length: 45 }),
    ipCountry: varchar('ip_country', { length: 2 }),
    userAgent: text('user_agent'),
  },
  t => [index('user_sign_in_events_user_id_created_at_idx').on(t.userId, t.createdAt, t.status)],
);

/**
 * Declaring the relations
 */

export const userSessionRelations = relations(userSessions, ({ many, one }) => ({
  tokens: many(userSessionTokens),
  user: one(users, { fields: [userSessions.userId], references: [users.id] }),
  userSignInEvent: one(userSignInEvents, { fields: [userSessions.userSignInEventId], references: [userSignInEvents.id] }),
}));

export const userSessionTokenRelations = relations(userSessionTokens, ({ one }) => ({
  session: one(userSessions, { fields: [userSessionTokens.sessionId], references: [userSessions.id] }),
  application: one(applications, { fields: [userSessionTokens.applicationId], references: [applications.id] }),
}));

export const userSignInEventRelations = relations(userSignInEvents, ({ one }) => ({
  user: one(users, { fields: [userSignInEvents.userId], references: [users.id] }),
}));
