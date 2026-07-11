/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, bigserial, index, integer, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { users } from './users.schema';

/**
 * Defining types
 */

export type MfaEnrollment = InferSelectModel<typeof mfaEnrollments>;
export type RecoveryCode = InferSelectModel<typeof recoveryCodes>;

export namespace MfaEnrollment {
  export type Method = InferEnum<typeof mfaMethod>;
}

/**
 * Declaring the constants
 */

export const mfaMethod = pgEnum('mfa_method', ['TOTP', 'WEBAUTHN', 'EMAIL_OTP']);

/**
 * Second-factor enrollments. TOTP seeds are stored only as AES-256-GCM envelope ciphertext
 * (`secret_ciphertext` carries the serialized ciphertext/iv/auth-tag, `kek_version` the wrapping
 * key); an enrollment is unusable until `verified_at` is set by a successful proof-of-possession.
 * `last_used_counter` pins the highest accepted TOTP time-step so a code cannot be replayed
 * within its validity window.
 */
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

/**
 * Single-use MFA bypass codes, stored only as argon2id hashes. Regeneration bumps `generation`
 * and removes the previous batch atomically; consumption stamps `used_at`.
 */
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

/**
 * Declaring the relations
 */

export const mfaEnrollmentsRelations = relations(mfaEnrollments, ({ one }) => ({
  user: one(users, { fields: [mfaEnrollments.userId], references: [users.id] }),
}));

export const recoveryCodesRelations = relations(recoveryCodes, ({ one }) => ({
  user: one(users, { fields: [recoveryCodes.userId], references: [users.id] }),
}));
