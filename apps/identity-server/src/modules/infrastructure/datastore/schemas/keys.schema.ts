/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, sql } from 'drizzle-orm';
import { integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

export type SigningKey = InferSelectModel<typeof signingKeys>;

export namespace SigningKey {
  export type Algorithm = InferEnum<typeof signingKeyAlgorithm>;
  export type Status = InferEnum<typeof signingKeyStatus>;
}

/**
 * Declaring the constants
 */

export const signingKeyAlgorithm = pgEnum('signing_key_algorithm', ['EdDSA']);
export const signingKeyStatus = pgEnum('signing_key_status', ['PENDING', 'ACTIVE', 'RETIRING', 'RETIRED']);

export const signingKeys = pgTable(
  'signing_keys',
  {
    kid: uuid('kid').primaryKey(),
    algorithm: signingKeyAlgorithm('algorithm').notNull().default('EdDSA'),
    publicJwk: jsonb('public_jwk').notNull().$type<Record<string, string>>(),

    /** Ed25519 private key (PKCS#8), envelope-encrypted with AES-256-GCM under the master key. */
    privateKeyCiphertext: text('private_key_ciphertext').notNull(),
    privateKeyIv: text('private_key_iv').notNull(),
    privateKeyAuthTag: text('private_key_auth_tag').notNull(),
    kekVersion: integer('kek_version').notNull().default(1),

    status: signingKeyStatus('status').notNull().default('PENDING'),
    notBefore: timestamp('not_before', { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('signing_keys_single_active_idx')
      .on(t.status)
      .where(sql`status = 'ACTIVE'`),
  ],
);
