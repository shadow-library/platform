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

export interface OAuthClientCredentials {
  readonly clientId: string;
  /** Present for confidential clients; sent as `client_secret` in the form body (`client_secret_post`). */
  readonly secret?: string;
}

export interface OAuthTestClient extends OAuthClientCredentials {
  readonly applicationId: number;
  readonly redirectUri: string;
}

export type ApplicationVisibility = 'PUBLIC' | 'RESTRICTED' | 'INTERNAL';

export interface OAuthApplicationOptions {
  /** Default `PUBLIC`. */
  visibility?: ApplicationVisibility;
  /** Gives the application a browser origin, so its provisioned client redirects to `<origin>/api/auth/callback` like a real first-party app. */
  withPublicUrl?: boolean;
}

export interface OAuthApplication {
  readonly applicationId: number;
  readonly name: string;
  /** `api://<name>`, the resource identity provisions for every application. */
  readonly audience: string;
  /**
   * The confidential first-party client identity provisions alongside the application, named after it: `authorization_code`,
   * `client_credentials` and token exchange, redirecting only to `<publicUrl>/api/auth/callback` when the application has one.
   */
  readonly serviceClient: OAuthClientCredentials;
  readonly publicUrl?: string;
}

export interface ApplicationPatch {
  visibility?: ApplicationVisibility;
  isActive?: boolean;
}

export type OAuthClientKind = 'SPA_PUBLIC' | 'WEB_CONFIDENTIAL';

export type OAuthGrantType = 'authorization_code' | 'refresh_token' | 'client_credentials';

export interface RegisterOAuthClientOptions {
  /** Default `SPA_PUBLIC`; `WEB_CONFIDENTIAL` gets a client secret. */
  kind?: OAuthClientKind;
  /** Default true. A third-party client needs the user's consent before authorize issues a code. */
  isFirstParty?: boolean;
  /** Default `authorization_code refresh_token`. */
  grantTypes?: OAuthGrantType[];
  /** Appended to the application name to form the client id. Default `spa` or `web` by kind. */
  suffix?: string;
}

export type ScopePrincipalType = 'USER' | 'SERVICE' | 'BOTH';

export interface CreateScopeOptions {
  description?: string;
  isSensitive?: boolean;
  /** Default `BOTH`. */
  principalType?: ScopePrincipalType;
}

export interface PkcePair {
  readonly verifier: string;
  readonly challenge: string;
}

export interface AuthorizeRequest {
  clientId: string;
  redirectUri: string;
  /** Default `code`. */
  responseType?: string;
  /** Default `openid offline_access`. */
  scope?: string;
  state?: string;
  nonce?: string;
  resource?: string;
  /** Sent as an S256 challenge; omitted entirely when `null`. */
  pkce?: PkcePair | null;
}

export interface AuthorizeOptions {
  /** Default `openid offline_access`. */
  scope?: string;
  state?: string;
  nonce?: string;
  resource?: string;
  pkce?: PkcePair;
}

export interface AuthorizeRedirect {
  readonly status: number;
  /** Where the 302 points; `null` when identity answered without a redirect. */
  readonly location: URL | null;
}

export interface AuthorizationCode {
  readonly code: string;
  readonly verifier: string;
}

export interface TokenResponseBody {
  access_token?: string;
  token_type?: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  code?: string;
}

export interface IssuedTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly idToken?: string;
  readonly body: TokenResponseBody;
}

export interface IntrospectionBody {
  active: boolean;
  sub?: string;
  scope?: string;
  aud?: string;
  exp?: number;
  client_id?: string;
  token_type?: string;
}

export interface ClientCredentialsOptions {
  scope?: string;
  resource?: string;
}

export interface RotatedClientSecret {
  readonly secret: string;
  readonly previousSecretsExpireAt: string;
}

export interface CreateAppSessionRequest {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

export interface MintAppTokenRequest {
  sessionHandle: string;
  resource?: string;
  scope?: string;
  elevated?: boolean;
}

export interface AppTokenBody {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  scope: string;
  audience: string;
  aal: 'AAL1' | 'AAL2';
}

export interface AppSessionOrganisation {
  id: string;
  slug: string;
  name: string;
  type: 'PERSONAL' | 'TEAM';
  active: boolean;
}

export interface OpenedAppSession {
  readonly handle: string;
  readonly userId: string;
  readonly scope: string;
}

/**
 * A first-party application's back end talking to identity's app-session API, authenticated by a client-credentials token
 * carrying `app-session:manage`.
 */
export interface AppSessionApi {
  readonly client: OAuthTestClient;
  create(request: CreateAppSessionRequest): Promise<APIResponse>;
  /** Authorizes as `sessionCtx`'s identity session and opens an app session from the code, throwing unless identity answers 201. */
  open(sessionCtx: APIRequestContext, options?: AuthorizeOptions): Promise<OpenedAppSession>;
  mint(request: MintAppTokenRequest): Promise<APIResponse>;
  claimElevation(sessionHandle: string, resource?: string): Promise<APIResponse>;
  organisations(sessionHandle: string): Promise<APIResponse>;
  switchOrganisation(sessionHandle: string, organisationId: string): Promise<APIResponse>;
}

/**
 * Declaring the constants
 *
 * The OAuth kit: an elevated admin caller minted in the database, throwaway PUBLIC applications with the clients, resources and
 * scope grants a scenario needs, and the authorize, token, introspection and revocation calls a relying party makes. Every client
 * redirects to a URI that is never followed, so authorize is read with `maxRedirects: 0`. Token-endpoint calls are form-encoded
 * and should go out on a cookie-less context, as a client's back end would send them.
 */

export const OAUTH_REDIRECT_URI = 'https://app.example.test/cb';
export const PLATFORM_AUDIENCE = 'shadow-identity';
export const APP_SESSION_SCOPE = 'app-session:manage';
export const APP_CALLBACK_PATH = '/api/auth/callback';

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

/** An admin application named `e2e-<label>-<hex>`, with its own `api://` resource and provisioned confidential client. */
export async function createOAuthApplication(admin: APIRequestContext, label = 'app', options: OAuthApplicationOptions = {}): Promise<OAuthApplication> {
  const name = `e2e-${label}-${randomBytes(4).toString('hex')}`;
  const publicUrl = options.withPublicUrl ? `https://${name}.example.test` : undefined;
  const created = await identityMutate(admin, 'post', '/api/v1/admin/applications', { name, subDomain: name, ...(publicUrl ? { publicUrls: [publicUrl] } : {}) });
  await expectStatus(created, 201, 'create application');
  const body = (await created.json()) as { id: number; clientId: string; audience: string; clientSecret?: string };
  const application: OAuthApplication = { applicationId: body.id, name, audience: body.audience, serviceClient: { clientId: body.clientId, secret: body.clientSecret }, publicUrl };

  try {
    await updateApplication(admin, body.id, { visibility: options.visibility ?? 'PUBLIC' });
  } catch (error) {
    await deleteOAuthApplication(admin, application).catch(() => undefined);
    throw error;
  }
  return application;
}

/** Removes every client registered on the application, then the application with its provisioned client, resources and scopes. */
export async function deleteOAuthApplication(admin: APIRequestContext, application: Pick<OAuthApplication, 'applicationId' | 'name'>): Promise<void> {
  if ((await admin.get(`/api/v1/admin/applications/${application.applicationId}`)).status() === 404) return;
  const listed = await admin.get(`/api/v1/admin/clients?applicationId=${application.applicationId}`);
  await expectStatus(listed, 200, 'list clients');
  const { items } = (await listed.json()) as { items: { id: string }[] };
  for (const client of items.filter(item => item.id !== application.name)) {
    const removed = await identityMutate(admin, 'delete', `/api/v1/admin/clients/${client.id}`);
    if (removed.status() !== 404) await expectStatus(removed, 200, `delete client ${client.id}`);
  }
  await expectStatus(await identityMutate(admin, 'delete', `/api/v1/admin/applications/${application.applicationId}`), 200, 'delete application');
}

export async function updateApplication(admin: APIRequestContext, applicationId: number, patch: ApplicationPatch): Promise<void> {
  await expectStatus(await identityMutate(admin, 'patch', `/api/v1/admin/applications/${applicationId}`, patch), 200, `update application ${applicationId}`);
}

/** Releases a platform RESTRICTED application to a team organisation. */
export async function releaseApplication(admin: APIRequestContext, applicationId: number, organisationId: string): Promise<void> {
  await expectStatus(await identityMutate(admin, 'post', `/api/v1/admin/applications/${applicationId}/organisations`, { organisationId }), 200, `release ${applicationId}`);
}

export async function revokeApplicationRelease(admin: APIRequestContext, applicationId: number, organisationId: string): Promise<void> {
  const response = await identityMutate(admin, 'delete', `/api/v1/admin/applications/${applicationId}/organisations/${organisationId}`);
  await expectStatus(response, 200, `revoke release of ${applicationId}`);
}

/** The application's provisioned client as a relying party redirecting to its public origin's callback. */
export function relyingPartyClient(application: OAuthApplication): OAuthTestClient {
  if (!application.publicUrl) throw new OAuthKitError(`application ${application.name} has no public URL to redirect to`);
  return { applicationId: application.applicationId, ...application.serviceClient, redirectUri: `${application.publicUrl}${APP_CALLBACK_PATH}` };
}

export async function registerOAuthClient(admin: APIRequestContext, application: OAuthApplication, options: RegisterOAuthClientOptions = {}): Promise<OAuthTestClient> {
  const kind = options.kind ?? 'SPA_PUBLIC';
  const clientId = `${application.name}-${options.suffix ?? (kind === 'SPA_PUBLIC' ? 'spa' : 'web')}`;
  const registered = await identityMutate(admin, 'post', '/api/v1/admin/clients', {
    clientId,
    applicationId: application.applicationId,
    name: `${clientId} client`,
    kind,
    isFirstParty: options.isFirstParty ?? true,
    redirectUris: [OAUTH_REDIRECT_URI],
    grantTypes: options.grantTypes ?? ['authorization_code', 'refresh_token'],
    ...(kind === 'WEB_CONFIDENTIAL' ? { authMethod: 'client_secret' } : {}),
  });
  await expectStatus(registered, 201, `register client ${clientId}`);
  const { secret } = (await registered.json()) as { secret?: string };
  return { applicationId: application.applicationId, clientId, redirectUri: OAUTH_REDIRECT_URI, secret };
}

/** A throwaway PUBLIC application with a first-party public (PKCE) client that may hold refresh tokens. */
export async function createOAuthTestClient(admin: APIRequestContext, label = 'client'): Promise<OAuthTestClient> {
  const application = await createOAuthApplication(admin, label);
  try {
    return await registerOAuthClient(admin, application);
  } catch (error) {
    await deleteOAuthApplication(admin, application).catch(() => undefined);
    throw error;
  }
}

/** Removes the client, then always the application with its provisioned identity client; a client already gone is fine. */
export async function deleteOAuthTestClient(admin: APIRequestContext, client: OAuthTestClient): Promise<void> {
  try {
    const removed = await identityMutate(admin, 'delete', `/api/v1/admin/clients/${client.clientId}`);
    if (removed.status() !== 404) await expectStatus(removed, 200, 'delete client');
  } finally {
    await expectStatus(await identityMutate(admin, 'delete', `/api/v1/admin/applications/${client.applicationId}`), 200, 'delete application');
  }
}

export async function findApiResourceId(admin: APIRequestContext, identifier: string): Promise<string> {
  const listed = await admin.get('/api/v1/admin/resources');
  await expectStatus(listed, 200, 'list resources');
  const { items } = (await listed.json()) as { items: { id: string; identifier: string }[] };
  const resource = items.find(item => item.identifier === identifier);
  if (!resource) throw new OAuthKitError(`no API resource ${identifier}`);
  return resource.id;
}

export async function findResourceScopeId(admin: APIRequestContext, identifier: string, name: string): Promise<string> {
  const listed = await admin.get('/api/v1/admin/resources');
  await expectStatus(listed, 200, 'list resources');
  const { items } = (await listed.json()) as { items: { identifier: string; scopes: { id: string; name: string }[] }[] };
  const scope = items.find(item => item.identifier === identifier)?.scopes.find(item => item.name === name);
  if (!scope) throw new OAuthKitError(`no scope ${name} on ${identifier}`);
  return scope.id;
}

/** Declares `name` on the resource `identifier` and returns the scope id. Identity resolves scopes by name across resources, so keep names unique per test. */
export async function createResourceScope(admin: APIRequestContext, identifier: string, name: string, options: CreateScopeOptions = {}): Promise<string> {
  const resourceId = await findApiResourceId(admin, identifier);
  const created = await identityMutate(admin, 'post', `/api/v1/admin/resources/${resourceId}/scopes`, { name, ...options });
  await expectStatus(created, 201, `create scope ${name}`);
  return ((await created.json()) as { id: string }).id;
}

export async function grantClientScope(admin: APIRequestContext, clientId: string, scopeId: string): Promise<void> {
  await expectStatus(await identityMutate(admin, 'post', `/api/v1/admin/clients/${clientId}/scopes`, { scopeId }), 200, `grant scope to ${clientId}`);
}

export async function rotateClientSecret(admin: APIRequestContext, clientId: string): Promise<RotatedClientSecret> {
  const rotated = await identityMutate(admin, 'post', `/api/v1/admin/clients/${clientId}/rotate-secret`);
  await expectStatus(rotated, 200, `rotate secret of ${clientId}`);
  return (await rotated.json()) as RotatedClientSecret;
}

/** Sends `/oauth2/authorize` on `ctx`'s identity session (if any) and reports the redirect without following it. */
export async function authorize(ctx: APIRequestContext, request: AuthorizeRequest): Promise<AuthorizeRedirect> {
  const pkce = request.pkce === undefined ? pkcePair() : request.pkce;
  const query = new URLSearchParams({
    client_id: request.clientId,
    redirect_uri: request.redirectUri,
    response_type: request.responseType ?? 'code',
    scope: request.scope ?? 'openid offline_access',
  });
  if (pkce) {
    query.set('code_challenge', pkce.challenge);
    query.set('code_challenge_method', 'S256');
  }
  if (request.state) query.set('state', request.state);
  if (request.nonce) query.set('nonce', request.nonce);
  if (request.resource) query.set('resource', request.resource);

  const response = await ctx.get(`/oauth2/authorize?${query.toString()}`, { maxRedirects: 0 });
  const location = response.headers().location;
  return { status: response.status(), location: location ? new URL(location, response.url()) : null };
}

/** Runs `/oauth2/authorize` on `ctx`'s identity session and returns the code from the 302 back to the client. */
export async function authorizeCode(ctx: APIRequestContext, client: OAuthTestClient, options: AuthorizeOptions = {}): Promise<AuthorizationCode> {
  const pkce = options.pkce ?? pkcePair();
  const { status, location } = await authorize(ctx, {
    clientId: client.clientId,
    redirectUri: client.redirectUri,
    scope: options.scope,
    state: options.state ?? randomBytes(8).toString('hex'),
    nonce: options.nonce,
    resource: options.resource,
    pkce,
  });
  const code = location?.href.startsWith(client.redirectUri) ? location.searchParams.get('code') : null;
  if (status !== 302 || !code) throw new OAuthKitError(`authorize answered ${status} → ${location?.href ?? '(no location)'}`);
  return { code, verifier: pkce.verifier };
}

function clientForm(client: OAuthClientCredentials): Record<string, string> {
  return client.secret ? { client_id: client.clientId, client_secret: client.secret } : { client_id: client.clientId };
}

export function exchangeCode(ctx: APIRequestContext, client: OAuthTestClient, authorization: AuthorizationCode): Promise<APIResponse> {
  return ctx.post('/oauth2/token', {
    form: { grant_type: 'authorization_code', code: authorization.code, redirect_uri: client.redirectUri, code_verifier: authorization.verifier, ...clientForm(client) },
  });
}

export function refreshGrant(ctx: APIRequestContext, client: OAuthClientCredentials, refreshToken: string): Promise<APIResponse> {
  return ctx.post('/oauth2/token', { form: { grant_type: 'refresh_token', refresh_token: refreshToken, ...clientForm(client) } });
}

export function clientCredentialsGrant(ctx: APIRequestContext, client: OAuthClientCredentials, options: ClientCredentialsOptions = {}): Promise<APIResponse> {
  const form: Record<string, string> = { grant_type: 'client_credentials', ...clientForm(client) };
  if (options.scope !== undefined) form.scope = options.scope;
  if (options.resource !== undefined) form.resource = options.resource;
  return ctx.post('/oauth2/token', { form });
}

export function introspectToken(ctx: APIRequestContext, client: OAuthClientCredentials, token: string): Promise<APIResponse> {
  return ctx.post('/oauth2/introspect', { form: { token, ...clientForm(client) } });
}

export function revokeToken(ctx: APIRequestContext, client: OAuthClientCredentials, token: string): Promise<APIResponse> {
  return ctx.post('/oauth2/revoke', { form: { token, ...clientForm(client) } });
}

/** `introspectToken`, throwing unless identity answers 200. */
export async function introspect(ctx: APIRequestContext, client: OAuthClientCredentials, token: string): Promise<IntrospectionBody> {
  const response = await introspectToken(ctx, client, token);
  await expectStatus(response, 200, 'introspect');
  return (await response.json()) as IntrospectionBody;
}

/** Authorizes as `sessionCtx`'s session and exchanges the code on `tokenCtx`, returning the tokens bound to that session. */
export async function issueTokens(sessionCtx: APIRequestContext, tokenCtx: APIRequestContext, client: OAuthTestClient, options: AuthorizeOptions = {}): Promise<IssuedTokens> {
  const response = await exchangeCode(tokenCtx, client, await authorizeCode(sessionCtx, client, options));
  const body = (await response.json()) as TokenResponseBody;
  if (response.status() !== 200 || !body.access_token || !body.refresh_token) throw new OAuthKitError(`code exchange answered ${response.status()}: ${JSON.stringify(body)}`);
  return { accessToken: body.access_token, refreshToken: body.refresh_token, idToken: body.id_token, body };
}

/** Authorizes as `sessionCtx`'s session and exchanges the code on `tokenCtx`, returning the refresh token bound to that session. */
export async function mintRefreshToken(sessionCtx: APIRequestContext, tokenCtx: APIRequestContext, client: OAuthTestClient): Promise<string> {
  return (await issueTokens(sessionCtx, tokenCtx, client)).refreshToken;
}

/** A client-credentials access token for `client`, throwing unless identity issues one. */
export async function serviceToken(ctx: APIRequestContext, client: OAuthClientCredentials, options: ClientCredentialsOptions = {}): Promise<string> {
  const response = await clientCredentialsGrant(ctx, client, options);
  const body = (await response.json()) as TokenResponseBody;
  if (response.status() !== 200 || !body.access_token) throw new OAuthKitError(`client_credentials answered ${response.status()}: ${JSON.stringify(body)}`);
  return body.access_token;
}

/**
 * Grants the application's provisioned client `app-session:manage` and returns its app-session API on `ctx`, which should be
 * cookie-less. The application must have a public URL, because an app session is opened from a code issued to that client.
 */
export async function createAppSessionApi(admin: APIRequestContext, ctx: APIRequestContext, application: OAuthApplication): Promise<AppSessionApi> {
  const client = relyingPartyClient(application);
  await grantClientScope(admin, client.clientId, await findResourceScopeId(admin, PLATFORM_AUDIENCE, APP_SESSION_SCOPE));
  const headers = { authorization: `Bearer ${await serviceToken(ctx, client, { scope: APP_SESSION_SCOPE })}` };
  const post = (path: string, data: object): Promise<APIResponse> => ctx.post(`/api/v1/app-sessions${path}`, { headers, data });
  const create = (request: CreateAppSessionRequest): Promise<APIResponse> => post('', request);

  return {
    client,
    create,
    open: async (sessionCtx, options) => {
      const { code, verifier } = await authorizeCode(sessionCtx, client, options);
      const response = await create({ code, codeVerifier: verifier, redirectUri: client.redirectUri });
      await expectStatus(response, 201, 'open app session');
      const body = (await response.json()) as { sessionHandle: string; userId: string; scope: string };
      return { handle: body.sessionHandle, userId: body.userId, scope: body.scope };
    },
    mint: request => post('/token', request),
    claimElevation: (sessionHandle, resource) => post('/elevation', resource === undefined ? { sessionHandle } : { sessionHandle, resource }),
    organisations: sessionHandle => post('/organisations', { sessionHandle }),
    switchOrganisation: (sessionHandle, organisationId) => post('/organisation', { sessionHandle, organisationId }),
  };
}
