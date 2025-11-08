/**
 * Importing npm packages
 */
import { relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, date, integer, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Declaring the tables
 */

export const userStatus = pgEnum('user_status', ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED']);
export const gender = pgEnum('gender', ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']);
export const userAuthProvider = pgEnum('user_auth_provider', ['PASSWORD', 'OTP', 'TOTP', 'GOOGLE', 'MICROSOFT']);
export const passwordAlgorithm = pgEnum('password_algorithm', ['BCRYPT', 'ARGON2']);

export const users = pgTable('users', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  username: varchar('username', { length: 32 }).notNull().unique(),
  status: userStatus('status').notNull().default('ACTIVE'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const userProfiles = pgTable('user_profiles', {
  userId: bigint('user_id', { mode: 'bigint' })
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  firstName: varchar('first_name', { length: 64 }).notNull(),
  lastName: varchar('last_name', { length: 64 }).notNull(),
  displayName: varchar('display_name', { length: 64 }).notNull(),
  gender: gender('gender').notNull().default('UNSPECIFIED'),
  dateOfBirth: date('date_of_birth'),
  avatarUrl: text('avatar_url'),
});

export const userEmails = pgTable('user_emails', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: bigint('user_id', { mode: 'bigint' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: varchar('email', { length: 255 }).notNull().unique(),
  isPrimary: boolean('is_primary').notNull().default(false),
  isVerified: boolean('is_verified').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const userPhones = pgTable('user_phones', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: bigint('user_id', { mode: 'bigint' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  phoneNumber: varchar('phone_number', { length: 15 }).notNull().unique(),
  isPrimary: boolean('is_primary').notNull().default(false),
  isVerified: boolean('is_verified').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const userAuthIdentities = pgTable('user_auth_identities', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: bigint('user_id', { mode: 'bigint' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: userAuthProvider('provider').notNull(),
  providerKey: varchar('provider_key', { length: 128 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const userPasswords = pgTable('user_passwords', {
  userAuthIdentityId: bigint('user_auth_identity_id', { mode: 'bigint' })
    .primaryKey()
    .references(() => userAuthIdentities.id, { onDelete: 'cascade' }),
  hash: text('hash').notNull(),
  algorithm: passwordAlgorithm('algorithm').notNull().default('BCRYPT'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/**
 * Declaring the relations
 */

export const usersRelations = relations(users, ({ many, one }) => ({
  profile: one(userProfiles),
  emails: many(userEmails),
  phones: many(userPhones),
  authIdentities: many(userAuthIdentities),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users),
}));

export const userEmailsRelations = relations(userEmails, ({ one }) => ({
  user: one(users),
}));

export const userPhonesRelations = relations(userPhones, ({ one }) => ({
  user: one(users),
}));

export const userAuthIdentitiesRelations = relations(userAuthIdentities, ({ one }) => ({
  user: one(users),
  password: one(userPasswords),
}));
