/**
 * Importing npm packages
 */
import { InferSelectModel } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, integer, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { organisations } from './organisations.schema';
import { users } from './users.schema';

/**
 * Defining types
 */

export type IdentityProvider = InferSelectModel<typeof identityProviders>;
export type FederatedIdentity = InferSelectModel<typeof federatedIdentities>;

/**
 * Declaring the constants
 *
 * Inbound OIDC federation (T-702): an organisation with a VERIFIED domain may delegate its
 * workforce sign-in to an external IdP. Discovery endpoints are snapshotted at configuration time
 * (SSRF-guarded), the upstream client secret is AES-256-GCM enveloped like every other stored
 * secret, and `enforced` turns home-realm discovery from an offer into a requirement (with a
 * break-glass carve-out for platform administrators so a broken upstream can't lock operators
 * out). One IdP per organisation until a real multi-IdP need appears.
 */

export const identityProviders = pgTable('identity_providers', {
  id: uuid('id').defaultRandom().primaryKey(),
  organisationId: bigint('organisation_id', { mode: 'bigint' })
    .notNull()
    .unique()
    .references(() => organisations.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  issuer: text('issuer').notNull(),
  clientId: text('client_id').notNull(),
  clientSecretCiphertext: text('client_secret_ciphertext').notNull(),
  clientSecretIv: text('client_secret_iv').notNull(),
  clientSecretAuthTag: text('client_secret_auth_tag').notNull(),
  kekVersion: integer('kek_version').notNull().default(1),
  scopes: varchar('scopes', { length: 255 }).notNull().default('openid email profile'),
  authorizationEndpoint: text('authorization_endpoint').notNull(),
  tokenEndpoint: text('token_endpoint').notNull(),
  jwksUri: text('jwks_uri').notNull(),
  enforced: boolean('enforced').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Returning federated users match on (identity provider, upstream subject) — NEVER on bare email
 * after the first link: an upstream that reassigns an email must not inherit the local account.
 */
export const federatedIdentities = pgTable(
  'federated_identities',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    identityProviderId: uuid('identity_provider_id')
      .notNull()
      .references(() => identityProviders.id, { onDelete: 'cascade' }),
    userId: bigint('user_id', { mode: 'bigint' })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subject: varchar('subject', { length: 255 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    unique('federated_identities_provider_subject_unique').on(t.identityProviderId, t.subject),
    unique('federated_identities_provider_user_unique').on(t.identityProviderId, t.userId),
    index('federated_identities_user_idx').on(t.userId),
  ],
);
