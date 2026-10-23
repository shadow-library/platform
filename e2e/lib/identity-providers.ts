import { type APIRequestContext, type APIResponse } from '@playwright/test';

import { identityDb } from './db';
import { identityMutate } from './identity-auth';

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

export interface GlobalProviderSnapshot {
  readonly id: string;
  readonly isActive: boolean;
}

/**
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

export interface ProviderSecretStorage {
  readonly envelope: unknown;
  readonly legacyCiphertext: string | null;
}

/** Where the provider's client secret is stored, so a spec can prove a patch that omitted the secret left it alone and that nothing is written to the legacy columns. */
export async function readProviderSecretStorage(providerId: string): Promise<ProviderSecretStorage> {
  const [row] = await identityDb()<ProviderSecretStorage[]>`
    SELECT client_secret_envelope AS envelope, client_secret_ciphertext AS "legacyCiphertext" FROM identity_providers WHERE id = ${providerId}
  `;
  if (!row) throw new IdentityProviderError(`no identity provider ${providerId}`);
  return row;
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
