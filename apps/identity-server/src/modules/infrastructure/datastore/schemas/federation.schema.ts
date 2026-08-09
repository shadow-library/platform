import { InferEnum, InferSelectModel, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, index, integer, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

import { organisations } from './organisations.schema';
import { users } from './users.schema';

export type IdentityProvider = InferSelectModel<typeof identityProviders>;
export type FederatedIdentity = InferSelectModel<typeof federatedIdentities>;

export namespace IdentityProvider {
  export type Kind = InferEnum<typeof identityProviderKind>;
}

/**
 * `OIDC` is enterprise SSO: one provider per organisation, reached by routing a verified email domain.
 * `GOOGLE`/`MICROSOFT` are platform-wide social sign-in, carry no organisation, and are chosen by the
 * user clicking a button — which is why the organisation column is nullable and the uniqueness rules
 * below are split rather than shared.
 */
export const identityProviderKind = pgEnum('identity_provider_kind', ['OIDC', 'GOOGLE', 'MICROSOFT']);

export const identityProviders = pgTable(
  'identity_providers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organisationId: bigint('organisation_id', { mode: 'bigint' }).references(() => organisations.id, { onDelete: 'cascade' }),
    kind: identityProviderKind('kind').notNull().default('OIDC'),
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
    /** Whether an unrecognised upstream subject may create a local account; turning it off makes a provider link-only. */
    allowSignUp: boolean('allow_sign_up').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  t => [
    uniqueIndex('identity_providers_organisation_unique')
      .on(t.organisationId)
      .where(sql`${t.organisationId} is not null`),
    uniqueIndex('identity_providers_global_kind_unique')
      .on(t.kind)
      .where(sql`${t.organisationId} is null`),
  ],
);

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
