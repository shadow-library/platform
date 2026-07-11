/**
 * Importing npm packages
 */
import { InferEnum, InferSelectModel, relations } from 'drizzle-orm';
import { bigint, boolean, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';

/**
 * Importing user defined packages
 */
import { applications } from './applications.schema';

/**
 * Defining types
 */

export type OAuthClient = InferSelectModel<typeof oauthClients>;
export type ApiResource = InferSelectModel<typeof apiResources>;
export type Scope = InferSelectModel<typeof scopes>;

export namespace OAuthClient {
  export type Kind = InferEnum<typeof oauthClientKind>;
  export type AuthMethod = InferEnum<typeof tokenEndpointAuthMethod>;
  export type Secret = InferSelectModel<typeof oauthClientSecrets>;
  export type RedirectUri = InferSelectModel<typeof oauthClientRedirectUris>;
}

/**
 * Declaring the constants
 */

export const oauthClientKind = pgEnum('oauth_client_kind', ['WEB_CONFIDENTIAL', 'SPA_PUBLIC', 'NATIVE_PUBLIC', 'SERVICE']);
export const tokenEndpointAuthMethod = pgEnum('token_endpoint_auth_method', ['client_secret_basic', 'private_key_jwt', 'none']);

export const oauthClients = pgTable('oauth_clients', {
  id: uuid('id').defaultRandom().primaryKey(),
  applicationId: integer('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 255 }).notNull(),
  kind: oauthClientKind('kind').notNull(),
  isFirstParty: boolean('is_first_party').notNull().default(false),
  tokenEndpointAuthMethod: tokenEndpointAuthMethod('token_endpoint_auth_method').notNull(),
  grantTypes: text('grant_types').array().notNull(),
  requirePkce: boolean('require_pkce').notNull().default(true),
  accessTokenTtl: integer('access_token_ttl').notNull().default(600),
  refreshTokenTtl: integer('refresh_token_ttl'),
  organisationId: bigint('organisation_id', { mode: 'bigint' }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const oauthClientSecrets = pgTable(
  'oauth_client_secrets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'cascade' }),
    secretHash: text('secret_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  t => [index('oauth_client_secrets_client_id_idx').on(t.clientId)],
);

export const oauthClientRedirectUris = pgTable(
  'oauth_client_redirect_uris',
  {
    clientId: uuid('client_id')
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'cascade' }),
    uri: text('uri').notNull(),
  },
  t => [primaryKey({ columns: [t.clientId, t.uri] })],
);

export const apiResources = pgTable('api_resources', {
  id: uuid('id').defaultRandom().primaryKey(),
  applicationId: integer('application_id')
    .notNull()
    .references(() => applications.id, { onDelete: 'cascade' }),
  identifier: varchar('identifier', { length: 255 }).notNull().unique(),
  displayName: varchar('display_name', { length: 255 }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scopes = pgTable(
  'scopes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    apiResourceId: uuid('api_resource_id')
      .notNull()
      .references(() => apiResources.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 128 }).notNull(),
    description: text('description'),
    isSensitive: boolean('is_sensitive').notNull().default(false),
  },
  t => [unique('scopes_resource_name_unique').on(t.apiResourceId, t.name)],
);

export const oauthClientScopeGrants = pgTable(
  'oauth_client_scope_grants',
  {
    clientId: uuid('client_id')
      .notNull()
      .references(() => oauthClients.id, { onDelete: 'cascade' }),
    scopeId: uuid('scope_id')
      .notNull()
      .references(() => scopes.id, { onDelete: 'cascade' }),
  },
  t => [primaryKey({ columns: [t.clientId, t.scopeId] })],
);

/**
 * Declaring the relations
 */

export const oauthClientRelations = relations(oauthClients, ({ many, one }) => ({
  application: one(applications, { fields: [oauthClients.applicationId], references: [applications.id] }),
  secrets: many(oauthClientSecrets),
  redirectUris: many(oauthClientRedirectUris),
  scopeGrants: many(oauthClientScopeGrants),
}));

export const oauthClientSecretRelations = relations(oauthClientSecrets, ({ one }) => ({
  client: one(oauthClients, { fields: [oauthClientSecrets.clientId], references: [oauthClients.id] }),
}));

export const oauthClientRedirectUriRelations = relations(oauthClientRedirectUris, ({ one }) => ({
  client: one(oauthClients, { fields: [oauthClientRedirectUris.clientId], references: [oauthClients.id] }),
}));

export const apiResourceRelations = relations(apiResources, ({ many }) => ({
  scopes: many(scopes),
}));

export const scopeRelations = relations(scopes, ({ one }) => ({
  apiResource: one(apiResources, { fields: [scopes.apiResourceId], references: [apiResources.id] }),
}));
