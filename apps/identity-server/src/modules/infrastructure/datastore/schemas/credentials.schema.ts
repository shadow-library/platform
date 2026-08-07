import { InferEnum, InferSelectModel, relations, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

import { users } from './users.schema';

export type MfaEnrollment = InferSelectModel<typeof mfaEnrollments>;
export type RecoveryCode = InferSelectModel<typeof recoveryCodes>;
export type WebauthnCredential = InferSelectModel<typeof webauthnCredentials>;

export namespace MfaEnrollment {
  export type Method = InferEnum<typeof mfaMethod>;
}

export const mfaMethod = pgEnum('mfa_method', ['TOTP', 'WEBAUTHN', 'EMAIL_OTP']);

export const mfaEnrollments = pgTable(
  'mfa_enrollments',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: mfaMethod('type').notNull(),
    secretCiphertext: text('secret_ciphertext'),
    kekVersion: integer('kek_version'),
    label: varchar('label', { length: 64 }).notNull().default('default'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    lastUsedCounter: bigint('last_used_counter', { mode: 'bigint' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [unique('mfa_enrollments_user_type_label_unique').on(t.userId, t.type, t.label)],
);

export const recoveryCodes = pgTable(
  'recovery_codes',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    generation: integer('generation').notNull().default(1),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index('recovery_codes_user_id_idx').on(t.userId)],
);

export const webauthnCredentials = pgTable(
  'webauthn_credentials',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull().unique(),
    publicKey: text('public_key').notNull(),
    signCount: bigint('sign_count', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    transports: text('transports'),
    aaguid: varchar('aaguid', { length: 36 }),
    backupEligible: boolean('backup_eligible').notNull().default(false),
    label: varchar('label', { length: 64 }).notNull().default('passkey'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  t => [index('webauthn_credentials_user_id_idx').on(t.userId)],
);

export const mfaEnrollmentsRelations = relations(mfaEnrollments, ({ one }) => ({
  user: one(users, { fields: [mfaEnrollments.userId], references: [users.id] }),
}));

export const webauthnCredentialsRelations = relations(webauthnCredentials, ({ one }) => ({
  user: one(users, { fields: [webauthnCredentials.userId], references: [users.id] }),
}));

export const recoveryCodesRelations = relations(recoveryCodes, ({ one }) => ({
  user: one(users, { fields: [recoveryCodes.userId], references: [users.id] }),
}));
