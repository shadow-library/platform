/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel } from 'drizzle-orm';
import { bigint, index, integer, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type VerificationChallenge = InferSelectModel<typeof verificationChallenges>;

export namespace VerificationChallenge {
  export type Type = InferEnum<typeof challengeType>;
}

/**
 * Declaring the constants
 */

export const challengeType = pgEnum('challenge_type', ['EMAIL_OTP', 'SMS_OTP', 'EMAIL_LINK']);

/**
 * One-time verification challenges (OTP codes, magic links). The code is stored only as a SHA-256
 * hash; the plaintext lives solely in the delivered notification. `user_id` has no foreign key so a
 * challenge can precede account creation (registration).
 */
export const verificationChallenges = pgTable(
  'verification_challenges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: bigint('user_id', { mode: 'bigint' }),
    flowId: varchar('flow_id', { length: 128 }),
    type: challengeType('type').notNull(),
    target: varchar('target', { length: 255 }).notNull(),
    codeHash: varchar('code_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [index('verification_challenges_flow_id_idx').on(t.flowId), index('verification_challenges_target_created_at_idx').on(t.target, t.createdAt)],
);
