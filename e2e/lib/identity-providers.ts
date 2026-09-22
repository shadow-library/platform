/**
 * Importing npm packages
 */
import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { identityDb } from './db';
import { identityMutate } from './identity-auth';

/**
 * Defining types
 */

export type SocialProviderKind = 'GOOGLE' | 'MICROSOFT' | 'APPLE';

export interface CreateGlobalProviderBody {
  kind: SocialProviderKind;
  name?: string;
  issuer: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  allowSignUp?: boolean;
  appleTeamId?: string;
  appleKeyId?: string;
}

export interface GlobalProvider {
  readonly id: string;
  readonly kind: SocialProviderKind;
  readonly issuer: string;
  readonly clientId: string;
  readonly allowSignUp: boolean;
  readonly isActive: boolean;
}

/** Identity's stored endpoints for a provider — what discovery resolved, and what a spec may re-point. */
export interface ProviderEndpoints {
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly jwksUri: string;
}

export interface GlobalProviderSnapshot {
  readonly id: string;
  readonly isActive: boolean;
}

/**
 * Declaring the constants
 *
 * The platform-wide social identity providers (`identity_providers` with no organisation), which are global
 * mutable state: one row per kind, and a social auth mode is enabled exactly when its provider row is active.
 * Creating one runs real OIDC discovery against the issuer, so the upstream must be reachable from the cluster.
 * A spec that adds or toggles one snapshots the set first and restores it in `afterAll` — every row it did not
 * find is removed, and every row it did find gets its `is_active` back.
 */

export const GOOGLE_ISSUER = 'https://accounts.google.com';
export const APPLE_ISSUER = 'https://appleid.apple.com';

/** A syntactically valid issuer whose host is the cloud metadata address — refused by the SSRF guard before any fetch. */
export const LINK_LOCAL_ISSUER = 'https://169.254.169.254';

export class IdentityProviderError extends Error {
  override readonly name = 'IdentityProviderError';
}

export function createGlobalProvider(admin: APIRequestContext, body: CreateGlobalProviderBody): Promise<APIResponse> {
  return identityMutate(admin, 'post', '/api/v1/admin/identity-providers', {
    name: `E2E ${body.kind}`,
    clientId: 'e2e-upstream-client',
    clientSecret: 'e2e-upstream-secret',
    ...body,
  });
}

/** `createGlobalProvider`, throwing unless identity answers 201. */
export async function registerGlobalProvider(admin: APIRequestContext, body: CreateGlobalProviderBody): Promise<GlobalProvider> {
  const response = await createGlobalProvider(admin, body);
  if (response.status() !== 201) throw new IdentityProviderError(`create ${body.kind} provider answered ${response.status()}: ${await response.text()}`);
  return (await response.json()) as GlobalProvider;
}

export function updateGlobalProvider(admin: APIRequestContext, providerId: string, patch: Partial<CreateGlobalProviderBody> & { isActive?: boolean }): Promise<APIResponse> {
  return identityMutate(admin, 'patch', `/api/v1/admin/identity-providers/${providerId}`, patch);
}

export function deleteGlobalProvider(admin: APIRequestContext, providerId: string): Promise<APIResponse> {
  return identityMutate(admin, 'delete', `/api/v1/admin/identity-providers/${providerId}`);
}

export async function listGlobalProviders(): Promise<GlobalProvider[]> {
  return identityDb()<GlobalProvider[]>`
    SELECT id::text, kind, issuer, client_id AS "clientId", allow_sign_up AS "allowSignUp", is_active AS "isActive"
    FROM identity_providers WHERE organisation_id IS NULL ORDER BY kind
  `;
}

export async function readProviderEndpoints(providerId: string): Promise<ProviderEndpoints> {
  const [row] = await identityDb()<ProviderEndpoints[]>`
    SELECT authorization_endpoint AS "authorizationEndpoint", token_endpoint AS "tokenEndpoint", jwks_uri AS "jwksUri" FROM identity_providers WHERE id = ${providerId}
  `;
  if (!row) throw new IdentityProviderError(`no identity provider ${providerId}`);
  return row;
}

/** The stored client-secret ciphertext, so a spec can prove a patch that omitted the secret left it alone. */
export async function readProviderSecretCiphertext(providerId: string): Promise<string> {
  const [row] = await identityDb()<{ ciphertext: string }[]>`SELECT client_secret_ciphertext AS ciphertext FROM identity_providers WHERE id = ${providerId}`;
  if (!row) throw new IdentityProviderError(`no identity provider ${providerId}`);
  return row.ciphertext;
}

/** How many local accounts the provider has linked, which a refused callback must leave at zero. */
export async function countFederatedIdentities(providerId: string): Promise<number> {
  const [row] = await identityDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM federated_identities WHERE identity_provider_id = ${providerId}`;
  return row?.count ?? 0;
}

/** Re-points a provider's token endpoint, the one upstream call a callback makes before anything is written locally. */
export async function setProviderTokenEndpoint(providerId: string, tokenEndpoint: string): Promise<void> {
  await identityDb()`UPDATE identity_providers SET token_endpoint = ${tokenEndpoint}, updated_at = now() WHERE id = ${providerId}`;
}

export async function snapshotGlobalProviders(): Promise<GlobalProviderSnapshot[]> {
  const providers = await listGlobalProviders();
  return providers.map(provider => ({ id: provider.id, isActive: provider.isActive }));
}

export async function restoreGlobalProviders(snapshot: GlobalProviderSnapshot[]): Promise<void> {
  const sql = identityDb();
  const keep = snapshot.map(provider => provider.id);
  if (keep.length === 0) await sql`DELETE FROM identity_providers WHERE organisation_id IS NULL`;
  else await sql`DELETE FROM identity_providers WHERE organisation_id IS NULL AND id NOT IN ${sql(keep)}`;
  for (const provider of snapshot) await sql`UPDATE identity_providers SET is_active = ${provider.isActive} WHERE id = ${provider.id}`;
}
