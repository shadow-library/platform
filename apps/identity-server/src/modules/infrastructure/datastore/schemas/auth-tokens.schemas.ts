/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, pgEnum, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { userAuthProvider, users } from './users.schema';

/**
 * Defining types
 */

export type UserSession = InferSelectModel<typeof userSessions>;
export type Device = InferSelectModel<typeof devices>;

export namespace UserSession {
  export type Status = InferEnum<typeof sessionStatus>;
  export type Aal = InferEnum<typeof sessionAal>;

  export type SignInEvent = InferSelectModel<typeof userSignInEvents>;
}

/**
 * Declaring the constants
 */

export const sessionStatus = pgEnum('session_status', ['ACTIVE', 'REVOKED', 'TERMINATED', 'EXPIRED']);
export const sessionAal = pgEnum('session_aal', ['AAL1', 'AAL2']);
export const signInStatus = pgEnum('sign_in_status', ['SUCCESS', 'INVALID_CREDENTIALS', 'MFA_FAILED', 'ACCOUNT_LOCKED', 'FAILED']);

export const devices = pgTable(
  'devices',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    fingerprintHash: varchar('fingerprint_hash', { length: 64 }).notNull(),
    name: varchar('name', { length: 255 }),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    trustedAt: timestamp('trusted_at', { withTimezone: true }),
  },
  t => [unique('devices_user_id_fingerprint_unique').on(t.userId, t.fingerprintHash)],
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 of the opaque session secret; the raw secret is only ever held in the cookie. */
    sessionHash: varchar('session_hash', { length: 64 }).notNull().unique(),
    userSignInEventId: uuid('user_sign_in_event_id').references(() => userSignInEvents.id, { onDelete: 'set null' }),
    deviceId: bigint('device_id', { mode: 'bigint' }).references(() => devices.id, { onDelete: 'set null' }),

    status: sessionStatus('status').notNull().default('ACTIVE'),
    aal: sessionAal('aal').notNull().default('AAL1'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    terminatedAt: timestamp('terminated_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    elevatedUntil: timestamp('elevated_until', { withTimezone: true }),

    ipAddress: varchar('ip_address', { length: 45 }),
    ipCountry: varchar('ip_country', { length: 2 }),
    userAgent: text('user_agent'),
  },
  t => [index('user_sessions_user_id_status_idx').on(t.userId, t.status)],
);

export const userSignInEvents = pgTable(
  'user_sign_in_events',
  {
    id: uuid('id').primaryKey(),
    /**
     * Nullable and intentionally without a foreign key: sign-in events are an immutable audit log.
     * Failed attempts against unknown identifiers have no user, and deleting a user must not erase
     * their authentication history. The user linkage is maintained at the application layer.
     */
    userId: bigint('user_id', { mode: 'bigint' }),

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
  t => [
    index('user_sign_in_events_user_id_created_at_idx').on(t.userId, t.createdAt, t.status),
    index('user_sign_in_events_identifier_created_at_idx').on(t.identifier, t.createdAt),
    index('user_sign_in_events_ip_address_created_at_idx').on(t.ipAddress, t.createdAt),
  ],
);

/**
 * Declaring the relations
 */

export const deviceRelations = relations(devices, ({ one }) => ({
  user: one(users, { fields: [devices.userId], references: [users.id] }),
}));

export const userSessionRelations = relations(userSessions, ({ one }) => ({
  user: one(users, { fields: [userSessions.userId], references: [users.id] }),
  device: one(devices, { fields: [userSessions.deviceId], references: [devices.id] }),
  userSignInEvent: one(userSignInEvents, { fields: [userSessions.userSignInEventId], references: [userSignInEvents.id] }),
}));

export const userSignInEventRelations = relations(userSignInEvents, ({ one }) => ({
  user: one(users, { fields: [userSignInEvents.userId], references: [users.id] }),
}));
