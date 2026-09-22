/**
 * Importing npm packages
 */
import { createHash, randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { identityMutate } from './identity-auth';
import { createIdentitySession, type IdentitySession, identitySessionContext, updateIdentitySession } from './identity-sessions';
import { readSeedManifest } from './personas';

/**
 * Defining types
 */

export interface AdminApi {
  readonly ctx: APIRequestContext;
  readonly session: IdentitySession;
  /** Terminates the minted admin session and disposes the context. */
  dispose(): Promise<void>;
}

export interface OAuthTestClient {
  readonly applicationId: number;
  readonly clientId: string;
  readonly redirectUri: string;
}

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

export interface AuthorizeOptions {
  /** Default `openid offline_access`. */
  scope?: string;
  state?: string;
  pkce?: PkcePair;
}

export interface AuthorizationCode {
  readonly code: string;
  readonly verifier: string;
}

export interface TokenResponseBody {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  code?: string;
}

/**
 * Declaring the constants
 *
 * A first slice of the OAuth kit: an elevated admin caller minted in the database, a throwaway PUBLIC application with a
 * first-party public (PKCE) client that may hold refresh tokens, and the authorize/token calls a user-facing flow needs. The
 * redirect URI is never followed, so authorize is read with `maxRedirects: 0`.
 */

const REDIRECT_URI = 'https://app.example.test/cb';

export class OAuthKitError extends Error {
  override readonly name = 'OAuthKitError';
}

async function expectStatus(response: APIResponse, status: number, action: string): Promise<void> {
  if (response.status() !== status) throw new OAuthKitError(`${action} answered ${response.status()}: ${await response.text()}`);
}

/** The bootstrap admin at AAL2 (so elevated admin routes pass), charged to `clientIp`. */
export async function createAdminApi(clientIp: string): Promise<AdminApi> {
  const session = await createIdentitySession(readSeedManifest().users.admin.userId, { aal: 'AAL2' });
  const ctx = await identitySessionContext(session, { clientIp });
  const dispose = async (): Promise<void> => {
    try {
      await ctx.dispose();
    } finally {
      await updateIdentitySession(session, { status: 'TERMINATED' });
    }
  };
  return { ctx, session, dispose };
}

export function pkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

export async function createOAuthTestClient(admin: APIRequestContext, label = 'client'): Promise<OAuthTestClient> {
  const name = `e2e-${label}-${randomBytes(4).toString('hex')}`;
  const created = await identityMutate(admin, 'post', '/api/v1/admin/applications', { name, subDomain: name });
  await expectStatus(created, 201, 'create application');
  const { id: applicationId } = (await created.json()) as { id: number };

  const clientId = `${name}-spa`;
  try {
    await expectStatus(await identityMutate(admin, 'patch', `/api/v1/admin/applications/${applicationId}`, { visibility: 'PUBLIC' }), 200, 'publish application');
    const registered = await identityMutate(admin, 'post', '/api/v1/admin/clients', {
      clientId,
      applicationId,
      name: `${name} public client`,
      kind: 'SPA_PUBLIC',
      isFirstParty: true,
      redirectUris: [REDIRECT_URI],
      grantTypes: ['authorization_code', 'refresh_token'],
    });
    await expectStatus(registered, 201, 'register client');
  } catch (error) {
    await deleteApplication(admin, applicationId).catch(() => undefined);
    throw error;
  }
  return { applicationId, clientId, redirectUri: REDIRECT_URI };
}

async function deleteApplication(admin: APIRequestContext, applicationId: number): Promise<void> {
  await expectStatus(await identityMutate(admin, 'delete', `/api/v1/admin/applications/${applicationId}`), 200, 'delete application');
}

/** Removes the client, then always the application with its provisioned identity client; a client already gone is fine. */
export async function deleteOAuthTestClient(admin: APIRequestContext, client: OAuthTestClient): Promise<void> {
  try {
    const removed = await identityMutate(admin, 'delete', `/api/v1/admin/clients/${client.clientId}`);
    if (removed.status() !== 404) await expectStatus(removed, 200, 'delete client');
  } finally {
    await deleteApplication(admin, client.applicationId);
  }
}

/** Runs `/oauth2/authorize` on `ctx`'s identity session and returns the code from the 302 back to the client. */
export async function authorizeCode(ctx: APIRequestContext, client: OAuthTestClient, options: AuthorizeOptions = {}): Promise<AuthorizationCode> {
  const pkce = options.pkce ?? pkcePair();
  const query = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: 'code',
    scope: options.scope ?? 'openid offline_access',
    code_challenge: pkce.challenge,
    code_challenge_method: 'S256',
    state: options.state ?? randomBytes(8).toString('hex'),
  });
  const response = await ctx.get(`/oauth2/authorize?${query.toString()}`, { maxRedirects: 0 });
  const location = response.headers().location ?? '';
  const code = location.startsWith(client.redirectUri) ? new URL(location).searchParams.get('code') : null;
  if (response.status() !== 302 || !code) throw new OAuthKitError(`authorize answered ${response.status()} → ${location || '(no location)'}`);
  return { code, verifier: pkce.verifier };
}

export function exchangeCode(ctx: APIRequestContext, client: OAuthTestClient, authorization: AuthorizationCode): Promise<APIResponse> {
  return ctx.post('/oauth2/token', {
    form: { grant_type: 'authorization_code', code: authorization.code, redirect_uri: client.redirectUri, client_id: client.clientId, code_verifier: authorization.verifier },
  });
}

export function refreshGrant(ctx: APIRequestContext, client: OAuthTestClient, refreshToken: string): Promise<APIResponse> {
  return ctx.post('/oauth2/token', { form: { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: client.clientId } });
}

/**
 * Authorizes as `sessionCtx`'s session and exchanges the code on `tokenCtx`, returning the refresh token bound to that session.
 * The token call goes out cookie-less, as a real client's back end would send it.
 */
export async function mintRefreshToken(sessionCtx: APIRequestContext, tokenCtx: APIRequestContext, client: OAuthTestClient): Promise<string> {
  const response = await exchangeCode(tokenCtx, client, await authorizeCode(sessionCtx, client));
  const body = (await response.json()) as TokenResponseBody;
  if (response.status() !== 200 || !body.refresh_token) throw new OAuthKitError(`code exchange answered ${response.status()}: ${JSON.stringify(body)}`);
  return body.refresh_token;
}
