import { InferEnum, InferSelectModel, sql } from 'drizzle-orm';
import { integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { type Envelope } from '@shadow-library/common/crypto';

import { jsonb } from './jsonb';

export type SigningKey = InferSelectModel<typeof signingKeys>;

export namespace SigningKey {
  export type Algorithm = InferEnum<typeof signingKeyAlgorithm>;
  export type Status = InferEnum<typeof signingKeyStatus>;
  export type Purpose = InferEnum<typeof signingKeyPurpose>;
}

export const signingKeyAlgorithm = pgEnum('signing_key_algorithm', ['EdDSA', 'RS256']);
export const signingKeyStatus = pgEnum('signing_key_status', ['PENDING', 'ACTIVE', 'RETIRING', 'RETIRED']);
/** OIDC keys are Ed25519 (JWKS); SAML keys are RSA-2048 — XML-DSIG interop rules out EdDSA. */
export const signingKeyPurpose = pgEnum('signing_key_purpose', ['OIDC', 'SAML']);

export const signingKeys = pgTable(
  'signing_keys',
  {
    kid: uuid('kid').primaryKey(),
    algorithm: signingKeyAlgorithm('algorithm').notNull().default('EdDSA'),
    purpose: signingKeyPurpose('purpose').notNull().default('OIDC'),
    publicJwk: jsonb('public_jwk').notNull().$type<Record<string, string>>(),
    certificatePem: text('certificate_pem'),

    /** Legacy, read only by the one-release backfill and fallback; superseded by `privateKeyEnvelope` */
    privateKeyCiphertext: text('private_key_ciphertext'),
    privateKeyIv: text('private_key_iv'),
    privateKeyAuthTag: text('private_key_auth_tag'),
    kekVersion: integer('kek_version').notNull().default(1),
    privateKeyEnvelope: jsonb('private_key_envelope').$type<Envelope>(),

    status: signingKeyStatus('status').notNull().default('PENDING'),
    notBefore: timestamp('not_before', { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    retiredAt: timestamp('retired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('signing_keys_single_active_idx')
      .on(t.purpose)
      .where(sql`status = 'ACTIVE'`),
  ],
);
