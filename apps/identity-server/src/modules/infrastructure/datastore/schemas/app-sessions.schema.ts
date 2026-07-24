/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, pgEnum, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { userSessions } from './auth-tokens.schemas';
import { oauthClients } from './oauth.schema';
import { users } from './users.schema';

/**
 * Defining types
 */

export type AppSession = InferSelectModel<typeof appSessions>;
export type AppSessionElevation = InferSelectModel<typeof appSessionElevations>;

export namespace AppSession {
  export type Status = InferEnum<typeof appSessionStatus>;
}

/**
 * Declaring the constants
 */

export const appSessionStatus = pgEnum('app_session_status', ['ACTIVE', 'REVOKED', 'EXPIRED']);

/**
 * A first-party application's server-side session. The application holds only the opaque handle — in
 * a cookie on its own domain — and exchanges it here for access tokens; every scrap of session state
 * lives on this row, so the application itself stores nothing per user.
 *
 * The handle is bound to `client_id`: minting requires the application's own M2M credentials as well
 * as the handle, so a stolen handle on its own is inert. `identity_session_id` keeps the central
 * session authoritative — an app session can never outlive the login that produced it.
 */
export const appSessions = pgTable(
  'app_sessions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    /** SHA-256 of the handle; the handle itself exists only in the application's cookie. */
    sessionHash: varchar('session_hash', { length: 64 }).notNull().unique(),
    clientId: varchar('client_id', { length: 64 })
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'cascade' }),
    identitySessionId: bigint('identity_session_id', { mode: 'bigint' })
      .notNull()
      .references(() => userSessions.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organisationId: bigint('organisation_id', { mode: 'bigint' }),
    /** The consented scope captured at creation; a mint may narrow this but never exceed it. */
    grantedScope: text('granted_scope').notNull().default(''),
    status: appSessionStatus('status').notNull().default('ACTIVE'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    terminatedAt: timestamp('terminated_at', { withTimezone: true }),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index('app_sessions_identity_session_idx').on(t.identitySessionId), index('app_sessions_client_user_idx').on(t.clientId, t.userId)],
);

/**
 * A step-up proof, deliberately narrowed to one application session **and** one audience.
 *
 * Elevation is never a property of the central session or of the user: it is a short-lived grant
 * addressed to a single resource server. Two applications, or one application talking to two APIs,
 * therefore never share elevated authority — each must obtain its own grant.
 */
export const appSessionElevations = pgTable(
  'app_session_elevations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    appSessionId: bigint('app_session_id', { mode: 'bigint' })
      .notNull()
      .references(() => appSessions.id, { onDelete: 'cascade' }),
    /** The single API resource this elevation authorises; a token for any other audience ignores it. */
    audience: varchar('audience', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('app_session_elevations_session_audience_unique').on(t.appSessionId, t.audience)],
);

/**
 * Declaring the relations
 */

export const appSessionRelations = relations(appSessions, ({ one, many }) => ({
  client: one(oauthClients, { fields: [appSessions.clientId], references: [oauthClients.id] }),
  identitySession: one(userSessions, { fields: [appSessions.identitySessionId], references: [userSessions.id] }),
  user: one(users, { fields: [appSessions.userId], references: [users.id] }),
  elevations: many(appSessionElevations),
}));

export const appSessionElevationRelations = relations(appSessionElevations, ({ one }) => ({
  appSession: one(appSessions, { fields: [appSessionElevations.appSessionId], references: [appSessions.id] }),
}));
