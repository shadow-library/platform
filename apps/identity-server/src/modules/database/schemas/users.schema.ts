/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, boolean, date, integer, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';

/**
 * Defining the types
 */

export type User = InferSelectModel<typeof users>;
export namespace User {
  export type Profile = InferSelectModel<typeof userProfiles>;
  export type Email = InferSelectModel<typeof userEmails>;
  export type Phone = InferSelectModel<typeof userPhones>;
  export type AuthIdentity = InferSelectModel<typeof userAuthIdentities>;
  export type Password = InferSelectModel<typeof userPasswords>;

  export type Status = InferEnum<typeof userStatus>;
  export type Gender = InferEnum<typeof gender>;
  export type AuthProvider = InferEnum<typeof userAuthProvider>;
  export type PasswordAlgorithm = InferEnum<typeof passwordAlgorithm>;
}

/**
 * Declaring the tables
 */

export const userStatus = pgEnum('user_status', ['ACTIVE', 'INACTIVE', 'DISABLED', 'SUSPENDED', 'CLOSED']);
export const gender = pgEnum('gender', ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED']);
export const userAuthProvider = pgEnum('user_auth_provider', ['PASSWORD', 'OTP', 'TOTP', 'GOOGLE', 'MICROSOFT']);
export const passwordAlgorithm = pgEnum('password_algorithm', ['BCRYPT', 'ARGON2ID']);

export const users = pgTable('users', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  username: varchar('username', { length: 32 }).unique(),
  status: userStatus('status').notNull().default('INACTIVE'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const userProfiles = pgTable('user_profiles', {
  userId: bigint('user_id', { mode: 'bigint' })
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  firstName: varchar('first_name', { length: 64 }),
  lastName: varchar('last_name', { length: 64 }),
  displayName: varchar('display_name', { length: 64 }),
  gender: gender('gender').notNull().default('UNSPECIFIED'),
  dateOfBirth: date('date_of_birth'),
  avatarUrl: text('avatar_url'),
});

export const userEmails = pgTable('user_emails', {
  id: bigserial('id', { mode: 'bigint' }).primaryKey(),
  userId: bigint('user_id', { mode: 'bigint' })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  emailId: varchar('email_id', { length: 255 }).notNull().unique(),
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
  user: one(users, { fields: [userProfiles.userId], references: [users.id] }),
}));

export const userEmailsRelations = relations(userEmails, ({ one }) => ({
  user: one(users, { fields: [userEmails.userId], references: [users.id] }),
}));

export const userPhonesRelations = relations(userPhones, ({ one }) => ({
  user: one(users, { fields: [userPhones.userId], references: [users.id] }),
}));

export const userAuthIdentitiesRelations = relations(userAuthIdentities, ({ one }) => ({
  user: one(users, { fields: [userAuthIdentities.userId], references: [users.id] }),
  password: one(userPasswords),
}));

export const userPasswordsRelations = relations(userPasswords, ({ one }) => ({
  authIdentity: one(userAuthIdentities, { fields: [userPasswords.userAuthIdentityId], references: [userAuthIdentities.id] }),
}));
