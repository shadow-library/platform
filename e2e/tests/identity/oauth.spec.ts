/**
 * Importing npm packages
 */
import { createHash, randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  authorize,
  authorizeCode,
  type AuthorizeRedirect,
  clientCredentialsGrant,
  createResourceScope,
  decodeJwt,
  exchangeCode,
  fetchJwks,
  grantClientScope,
  identityDb,
  identityMutate,
  introspect,
  introspectToken,
  issueTokens,
  type OAuthApplication,
  type OAuthClientCredentials,
  pkcePair,
  readSessionStatus,
  refreshGrant,
  registerOAuthClient,
  requireProductUrl,
  revokeToken,
  rotateClientSecret,
  type ScopePrincipalType,
  swapJwtPayload,
  type TokenResponseBody,
  unsignedJwt,
  verifyJwt,
} from '../../lib';
import { expect, test } from './fixtures';
import { expectErrorCode } from './helpers';

/**
 * Defining types
 */

interface FamilyRow {
  id: string;
  status: string;
  revokeReason: string | null;
}

interface TokenRow {
  status: string;
  tokenHash: string;
}

/**
 * Declaring the constants
 *
 * Identity as an OAuth 2 / OIDC provider: authorize validation, discovery and signing keys, the code flow with PKCE, refresh
 * rotation and reuse detection, introspection and revocation, and client-credentials audience binding. Every test registers its
 * own applications, clients, resources and scopes (scope names carry a per-test tag, because identity resolves scopes by name
 * across resources), signs its users in through the database, and sends token-endpoint calls cookie-less.
 */

const ISSUER = new URL(requireProductUrl('identity')).origin;
const DEFAULT_AUDIENCE = 'shadow-identity';
const OVERLAP_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5_000;

function tag(): string {
  return `e2e${randomBytes(3).toString('hex')}`;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function tokenBody(response: APIResponse): Promise<TokenResponseBody> {
  return (await response.json()) as TokenResponseBody;
}

async function expectTokenError(response: APIResponse, status: number, code: string): Promise<void> {
  const body = await tokenBody(response);
  expect(response.status(), JSON.stringify(body)).toBe(status);
  expect(body.code).toBe(code);
  expect(body.access_token, 'a refused token request must not carry a token').toBeUndefined();
  expect(body.refresh_token).toBeUndefined();
}

async function accessTokenOf(response: APIResponse): Promise<string> {
  const body = await tokenBody(response);
  expect(response.status(), JSON.stringify(body)).toBe(200);
  expect(body.access_token).toBeTruthy();
  return body.access_token ?? '';
}

function userinfo(ctx: APIRequestContext, token: string): Promise<APIResponse> {
  return ctx.get('/oauth2/userinfo', { headers: { authorization: `Bearer ${token}` } });
}

async function expectBearerRefused(response: APIResponse): Promise<void> {
  expect(response.status()).toBe(401);
  const body = (await response.json()) as Record<string, unknown>;
  for (const claim of ['sub', 'email', 'name']) expect(body, `a refused bearer must not release ${claim}`).not.toHaveProperty(claim);
}

function expectInvalidRequestPage(redirect: AuthorizeRedirect, params: Record<string, string>): void {
  expect(redirect.status).toBe(302);
  expect(redirect.location?.origin, 'the browser must stay on identity').toBe(ISSUER);
  expect(redirect.location?.pathname).toBe('/invalid-request');
  expect(Object.fromEntries(redirect.location?.searchParams ?? [])).toEqual(params);
}

function expectClientRedirect(redirect: AuthorizeRedirect, redirectUri: string, params: Record<string, string>): void {
  expect(redirect.status).toBe(302);
  expect(`${redirect.location?.origin}${redirect.location?.pathname}`).toBe(redirectUri);
  expect(Object.fromEntries(redirect.location?.searchParams ?? [])).toEqual(params);
}

async function familiesOf(clientId: string, userId: string): Promise<FamilyRow[]> {
  return identityDb()<FamilyRow[]>`
    SELECT id::text, status, revoke_reason AS "revokeReason" FROM refresh_token_families WHERE client_id = ${clientId} AND user_id = ${userId} ORDER BY created_at
  `;
}

async function tokensOf(familyId: string): Promise<TokenRow[]> {
  return identityDb()<TokenRow[]>`SELECT status, token_hash AS "tokenHash" FROM refresh_tokens WHERE family_id = ${familyId} ORDER BY created_at`;
}

async function onlyFamily(clientId: string, userId: string): Promise<FamilyRow> {
  const families = await familiesOf(clientId, userId);
  expect(families).toHaveLength(1);
  return families[0] as FamilyRow;
}

test.describe('identity OAuth — authorize request validation', () => {
  test('should keep failures before the redirect URI is trusted on identity and report the rest to the registered URI', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const application = await identity.createOAuthApp('authz');
    const client = await registerOAuthClient(admin, application);
    const foreign = await identity.createOAuthApp('authz-foreign');
    const user = await identity.createUser({ label: 'authz' });
    const { ctx } = await identity.signIn(user);
    const state = randomBytes(8).toString('hex');
    const request = { clientId: client.clientId, redirectUri: client.redirectUri, scope: 'openid', state };

    const unregistered = ['https://app.example.test/cb/', 'https://app.example.test/cb?x=1', 'https://other.example.test/cb', 'not-a-url'];
    for (const redirectUri of unregistered) {
      const redirect = await authorize(ctx, { ...request, redirectUri });
      expectInvalidRequestPage(redirect, { error: 'invalid_redirect_uri', client_id: client.clientId, redirect_uri: redirectUri, application: application.name });
    }

    const unknownClientId = `e2e-unknown-${randomBytes(4).toString('hex')}`;
    const unknown = await authorize(ctx, { ...request, clientId: unknownClientId });
    expectInvalidRequestPage(unknown, { error: 'invalid_client', client_id: unknownClientId, redirect_uri: client.redirectUri });

    const implicit = await authorize(ctx, { ...request, responseType: 'token' });
    expectClientRedirect(implicit, client.redirectUri, { error: 'unsupported_response_type', state });

    const untargeted = await authorize(ctx, { ...request, resource: foreign.audience });
    expectClientRedirect(untargeted, client.redirectUri, { error: 'invalid_target', state });

    const signedOut = await authorize(await identity.anonymous(), request);
    expect(signedOut.status).toBe(302);
    expect(signedOut.location?.origin).toBe(ISSUER);
    expect(signedOut.location?.pathname).toBe('/login');
    expect(signedOut.location?.searchParams.get('return_to')).toMatch(new RegExp(`^${ISSUER}/oauth2/authorize\\?`));
    expect(signedOut.location?.searchParams.has('code')).toBe(false);

    const granted = await authorize(ctx, request);
    expect(granted.status).toBe(302);
    expect(`${granted.location?.origin}${granted.location?.pathname}`).toBe(client.redirectUri);
    expect(granted.location?.searchParams.get('code'), 'the same request with a registered URI and a session is granted').toBeTruthy();
    expect(granted.location?.searchParams.get('state')).toBe(state);
  });
});

test.describe('identity OIDC — discovery and signing keys', () => {
  test('should advertise the provider’s endpoints, grants and algorithms in the discovery document', async ({ identity }) => {
    const response = await (await identity.anonymous()).get('/.well-known/openid-configuration');
    expect(response.status()).toBe(200);
    const discovery = (await response.json()) as Record<string, unknown>;

    expect(discovery).toMatchObject({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/oauth2/authorize`,
      token_endpoint: `${ISSUER}/oauth2/token`,
      userinfo_endpoint: `${ISSUER}/oauth2/userinfo`,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      revocation_endpoint: `${ISSUER}/oauth2/revoke`,
      introspection_endpoint: `${ISSUER}/oauth2/introspect`,
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'private_key_jwt', 'none'],
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials', 'urn:ietf:params:oauth:grant-type:token-exchange'],
      id_token_signing_alg_values_supported: ['EdDSA'],
      code_challenge_methods_supported: ['S256'],
      backchannel_logout_supported: true,
      backchannel_logout_session_supported: true,
      step_up_endpoint: `${ISSUER}/step-up`,
      app_session_endpoint: `${ISSUER}/api/v1/app-sessions`,
    });
    expect(discovery.scopes_supported).toEqual(expect.arrayContaining(['openid', 'profile', 'email', 'offline_access']));
  });

  test('should publish only public Ed25519 keys and reject a token whose payload was swapped or whose signature was stripped', async ({ identity }) => {
    const anonymous = await identity.anonymous();
    const jwks = await fetchJwks(anonymous);
    expect(jwks.keys.length).toBeGreaterThan(0);
    for (const key of jwks.keys) {
      expect(Object.keys(key).sort(), 'no private member may be published').toEqual(['alg', 'crv', 'kid', 'kty', 'use', 'x']);
      expect(key).toMatchObject({ kty: 'OKP', crv: 'Ed25519', use: 'sig', alg: 'EdDSA' });
      expect(key.x).toEqual(expect.any(String));
    }

    const application = await identity.createOAuthApp('keys');
    const client = await registerOAuthClient((await identity.admin()).ctx, application, { kind: 'WEB_CONFIDENTIAL' });
    const user = await identity.createUser({ label: 'keys' });
    const other = await identity.createUser({ label: 'keys-other' });
    const { ctx } = await identity.signIn(user);
    const { accessToken } = await issueTokens(ctx, anonymous, client, { scope: 'openid' });
    expect(verifyJwt(accessToken, jwks)).toMatchObject({ sub: user.sub });
    expect((await userinfo(anonymous, accessToken)).status(), 'the untampered token is accepted').toBe(200);
    expect(await introspect(anonymous, client, accessToken)).toMatchObject({ active: true, sub: user.sub });

    const swapped = swapJwtPayload(accessToken, { sub: other.sub });
    expect(() => verifyJwt(swapped, jwks)).toThrow();
    await expectBearerRefused(await userinfo(anonymous, swapped));
    expect(await introspect(anonymous, client, swapped)).toEqual({ active: false });

    const unsigned = unsignedJwt(accessToken);
    expect(decodeJwt(unsigned).header).toEqual({ alg: 'none', typ: 'JWT' });
    await expectBearerRefused(await userinfo(anonymous, unsigned));
    expect(await introspect(anonymous, client, unsigned)).toEqual({ active: false });
  });

  test.fixme('should answer a bad bearer on userinfo with invalid_token and a WWW-Authenticate challenge', async ({ identity }) => {
    // identity returns OAU_002 invalid_client and no WWW-Authenticate for a bad bearer on userinfo (RFC 6750 §3.1, OIDC Core §5.3.3).
    const response = await userinfo(await identity.anonymous(), 'not-a-token');
    expect(response.status()).toBe(401);
    expect(response.headers()['www-authenticate']).toMatch(/^Bearer\b.*error="invalid_token"/);
    await expectErrorCode(response, 'invalid_token');
  });
});

test.describe('identity OAuth — authorization code flow', () => {
  test('should issue JWKS-verifiable tokens through code + PKCE and scope the userinfo claims to the grant', async ({ identity }) => {
    const application = await identity.createOAuthApp('code');
    const client = await registerOAuthClient((await identity.admin()).ctx, application, { kind: 'WEB_CONFIDENTIAL' });
    const names = { firstName: `Ada${randomBytes(2).toString('hex')}`, lastName: `Lovelace${randomBytes(2).toString('hex')}` };
    const user = await identity.createUser({ label: 'code', ...names });
    const { session, ctx } = await identity.signIn(user);
    const tokenCtx = await identity.anonymous();
    const jwks = await fetchJwks(tokenCtx);
    const nonce = randomBytes(12).toString('base64url');

    const authorization = await authorizeCode(ctx, client, { scope: 'openid', nonce });
    const exchanged = await exchangeCode(tokenCtx, client, authorization);
    const body = await tokenBody(exchanged);
    expect(exchanged.status(), JSON.stringify(body)).toBe(200);
    expect(body).toMatchObject({ token_type: 'Bearer', scope: 'openid' });

    const accessClaims = verifyJwt(body.access_token ?? '', jwks);
    expect(accessClaims).toMatchObject({
      iss: ISSUER,
      sub: user.sub,
      client_id: client.clientId,
      aud: DEFAULT_AUDIENCE,
      scope: 'openid',
      token_type: 'user',
      sid: session.sessionId,
    });
    const idClaims = verifyJwt(body.id_token ?? '', jwks);
    expect(idClaims).toMatchObject({ iss: ISSUER, sub: user.sub, aud: client.clientId, nonce, email: user.email });

    const openidOnly = await userinfo(tokenCtx, body.access_token ?? '');
    expect(openidOnly.status()).toBe(200);
    const openidClaims = (await openidOnly.json()) as Record<string, unknown>;
    expect(openidClaims).toMatchObject({ sub: user.sub, email: user.email });
    for (const claim of ['name', 'given_name', 'family_name']) expect(openidClaims, `openid alone must not release ${claim}`).not.toHaveProperty(claim);

    const replayed = await exchangeCode(tokenCtx, client, authorization);
    await expectTokenError(replayed, 400, 'invalid_grant');

    const withProfile = await accessTokenOf(await exchangeCode(tokenCtx, client, await authorizeCode(ctx, client, { scope: 'openid profile' })));
    const profileClaims = (await (await userinfo(tokenCtx, withProfile)).json()) as Record<string, unknown>;
    expect(profileClaims).toMatchObject({
      sub: user.sub,
      email: user.email,
      name: `${names.firstName} ${names.lastName}`,
      given_name: names.firstName,
      family_name: names.lastName,
    });

    const wrongVerifier = await authorizeCode(ctx, client, { scope: 'openid' });
    await expectTokenError(await exchangeCode(tokenCtx, client, { ...wrongVerifier, verifier: pkcePair().verifier }), 400, 'invalid_grant');
    await expectTokenError(await exchangeCode(tokenCtx, client, wrongVerifier), 400, 'invalid_grant');

    const wrongSecret = await authorizeCode(ctx, client, { scope: 'openid' });
    await expectTokenError(await exchangeCode(tokenCtx, { ...client, secret: randomBytes(32).toString('base64url') }, wrongSecret), 401, 'invalid_client');
    await accessTokenOf(await exchangeCode(tokenCtx, client, wrongSecret));
  });
});

test.describe('identity OAuth — refresh tokens', () => {
  test('should rotate a refresh token and, on replay of the superseded one, revoke the family and its session', async ({ identity }) => {
    const application = await identity.createOAuthApp('refresh-reuse');
    const client = await registerOAuthClient((await identity.admin()).ctx, application);
    const user = await identity.createUser({ label: 'refresh-reuse' });
    const { session, ctx } = await identity.signIn(user);
    const tokenCtx = await identity.anonymous();
    const { refreshToken: first } = await issueTokens(ctx, tokenCtx, client);

    const rotated = await refreshGrant(tokenCtx, client, first);
    const rotatedBody = await tokenBody(rotated);
    expect(rotated.status(), JSON.stringify(rotatedBody)).toBe(200);
    expect(rotatedBody.access_token).toBeTruthy();
    const second = rotatedBody.refresh_token ?? '';
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    await expectTokenError(await refreshGrant(tokenCtx, client, first), 400, 'invalid_grant');
    await expectTokenError(await refreshGrant(tokenCtx, client, second), 400, 'invalid_grant');

    expect((await ctx.get('/api/v1/me')).status(), 'the session the family was bound to is dead').toBe(401);
    expect(await readSessionStatus(session.sessionId)).toBe('TERMINATED');
    const family = await onlyFamily(client.clientId, user.userId);
    expect(family).toMatchObject({ status: 'REVOKED', revokeReason: 'ROTATION_REUSE' });
    expect((await tokensOf(family.id)).map(token => token.status)).toEqual(['REVOKED', 'REVOKED']);
    const audits = await identityDb()<{ outcome: string; actorId: string }[]>`
      SELECT outcome, actor_id AS "actorId" FROM audit_events WHERE action = 'security.token_reuse' AND target_id = ${family.id}
    `;
    expect(audits).toEqual([{ outcome: 'FAILURE', actorId: user.userId }]);
  });

  test('should refuse a refresh token presented by another client without consuming it', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const application = await identity.createOAuthApp('refresh-client');
    const owner = await registerOAuthClient(admin, application);
    const intruder = await registerOAuthClient(admin, application, { suffix: 'intruder' });
    const user = await identity.createUser({ label: 'refresh-client' });
    const { ctx } = await identity.signIn(user);
    const tokenCtx = await identity.anonymous();
    const { refreshToken } = await issueTokens(ctx, tokenCtx, owner);

    await expectTokenError(await refreshGrant(tokenCtx, intruder, refreshToken), 400, 'invalid_grant');
    const family = await onlyFamily(owner.clientId, user.userId);
    expect(family.status).toBe('ACTIVE');
    expect(await tokensOf(family.id)).toEqual([{ status: 'ACTIVE', tokenHash: sha256(refreshToken) }]);

    const rightful = await refreshGrant(tokenCtx, owner, refreshToken);
    expect(rightful.status(), 'the rightful client can still rotate the token').toBe(200);
    expect((await onlyFamily(owner.clientId, user.userId)).status).toBe('ACTIVE');
  });

  test('should let exactly one of two concurrent rotations of the same refresh token succeed', async ({ identity }) => {
    const application = await identity.createOAuthApp('refresh-race');
    const client = await registerOAuthClient((await identity.admin()).ctx, application);
    const user = await identity.createUser({ label: 'refresh-race' });
    const { session, ctx } = await identity.signIn(user);
    const { refreshToken } = await issueTokens(ctx, await identity.anonymous(), client);

    const racers = await Promise.all([identity.anonymous(), identity.anonymous()]);
    const responses = await Promise.all(racers.map(racer => refreshGrant(racer, client, refreshToken)));
    const bodies = await Promise.all(responses.map(tokenBody));
    expect(responses.map(response => response.status()).sort()).toEqual([200, 400]);
    const winner = bodies.find(body => body.refresh_token);
    const loser = bodies.find(body => !body.refresh_token);
    expect(loser?.code).toBe('invalid_grant');

    const family = await onlyFamily(client.clientId, user.userId);
    const active = (await tokensOf(family.id)).filter(token => token.status === 'ACTIVE').map(token => token.tokenHash);
    const [audit] = await identityDb()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM audit_events WHERE action = 'security.token_reuse' AND target_id = ${family.id} AND outcome = 'FAILURE' AND actor_id = ${user.userId}
    `;
    // Which branch runs depends on whether the loser read the token before or after the winner committed; neither may fork the family.
    expect([
      { status: 'ACTIVE', revokeReason: null, active: [sha256(winner?.refresh_token ?? '')], session: 'ACTIVE', reuseAudits: 0 },
      { status: 'REVOKED', revokeReason: 'ROTATION_REUSE', active: [], session: 'TERMINATED', reuseAudits: 1 },
    ]).toContainEqual({ status: family.status, revokeReason: family.revokeReason, active, session: await readSessionStatus(session.sessionId), reuseAudits: audit?.count });
  });

  test('should fail every refresh token issued under a session once that session signs out', async ({ identity }) => {
    const application = await identity.createOAuthApp('refresh-signout');
    const client = await registerOAuthClient((await identity.admin()).ctx, application);
    const user = await identity.createUser({ label: 'refresh-signout' });
    const { ctx } = await identity.signIn(user);
    const tokenCtx = await identity.anonymous();
    const { refreshToken } = await issueTokens(ctx, tokenCtx, client);

    expect((await identityMutate(ctx, 'post', '/api/v1/auth/signout')).status()).toBe(204);
    await expectTokenError(await refreshGrant(tokenCtx, client, refreshToken), 400, 'invalid_grant');
    expect(await onlyFamily(client.clientId, user.userId)).toMatchObject({ status: 'REVOKED', revokeReason: 'LOGOUT' });
  });
});

test.describe('identity OAuth — introspection and revocation', () => {
  test('should introspect and revoke a token only for the confidential client that owns it', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const application = await identity.createOAuthApp('introspect');
    const owner = await registerOAuthClient(admin, application, { kind: 'WEB_CONFIDENTIAL' });
    const publicClient = await registerOAuthClient(admin, application);
    const stranger = application.serviceClient;
    const user = await identity.createUser({ label: 'introspect' });
    const { ctx } = await identity.signIn(user);
    const tokenCtx = await identity.anonymous();
    const { accessToken, refreshToken } = await issueTokens(ctx, tokenCtx, owner);

    const access = await introspect(tokenCtx, owner, accessToken);
    expect(access).toMatchObject({ active: true, token_type: 'access_token', sub: user.sub, client_id: owner.clientId, aud: DEFAULT_AUDIENCE });
    expect(access.exp).toEqual(decodeJwt(accessToken).payload.exp);
    expect(await introspect(tokenCtx, owner, refreshToken)).toMatchObject({ active: true, token_type: 'refresh_token', sub: user.sub, client_id: owner.clientId });
    expect(await introspect(tokenCtx, owner, 'garbage')).toEqual({ active: false });

    expect(await introspect(tokenCtx, stranger, accessToken), 'a non-owner learns nothing about an access token').toEqual({ active: false });
    expect(await introspect(tokenCtx, stranger, refreshToken), 'a non-owner learns nothing about a refresh token').toEqual({ active: false });

    const fromPublic = await introspectToken(tokenCtx, publicClient, accessToken);
    expect(fromPublic.status()).toBe(401);
    await expectErrorCode(fromPublic, 'invalid_client');

    const asJson = await tokenCtx.post('/oauth2/introspect', { data: { token: accessToken, client_id: owner.clientId, client_secret: owner.secret } });
    expect(asJson.status()).toBe(400);
    await expectErrorCode(asJson, 'invalid_request');

    const foreignRevoke = await revokeToken(tokenCtx, stranger, refreshToken);
    expect(foreignRevoke.status()).toBe(200);
    expect(await introspect(tokenCtx, owner, refreshToken), 'a non-owner’s revocation is ignored').toMatchObject({ active: true, token_type: 'refresh_token' });
    expect((await onlyFamily(owner.clientId, user.userId)).status).toBe('ACTIVE');

    const ownRevoke = await revokeToken(tokenCtx, owner, refreshToken);
    expect(ownRevoke.status()).toBe(200);
    expect(await ownRevoke.json()).toEqual({ revoked: true });
    expect(await introspect(tokenCtx, owner, refreshToken)).toEqual({ active: false });
    expect(await onlyFamily(owner.clientId, user.userId)).toMatchObject({ status: 'REVOKED', revokeReason: 'LOGOUT' });
  });
});

test.describe('identity OAuth — client credentials', () => {
  async function serviceClaims(ctx: APIRequestContext, client: OAuthClientCredentials, scope: string | undefined, resource: string): Promise<Record<string, unknown>> {
    const response = await clientCredentialsGrant(ctx, client, { scope, resource });
    const token = await accessTokenOf(response);
    expect(decodeJwt(token).payload).toMatchObject({ iss: ISSUER, sub: client.clientId, client_id: client.clientId, token_type: 'service' });
    return verifyJwt(token, await fetchJwks(ctx));
  }

  async function grantOn(admin: APIRequestContext, target: OAuthApplication, client: OAuthClientCredentials, name: string, principalType?: ScopePrincipalType): Promise<void> {
    await grantClientScope(admin, client.clientId, await createResourceScope(admin, target.audience, name, { principalType }));
  }

  test('should bind a client-credentials token to the requested audience and the service scopes granted on it', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const alpha = await identity.createOAuthApp('cc-alpha');
    const beta = await identity.createOAuthApp('cc-beta');
    const caller = await identity.createOAuthApp('cc-caller');
    const client = caller.serviceClient;
    const scopes = { read: `${tag()}:read`, write: `${tag()}:write`, run: `${tag()}:run`, profile: `${tag()}:profile`, beta: `${tag()}:read` };
    await grantOn(admin, alpha, client, scopes.read);
    await grantOn(admin, beta, client, scopes.beta);
    await grantOn(admin, alpha, client, scopes.run, 'SERVICE');
    await grantOn(admin, alpha, client, scopes.profile, 'USER');
    await createResourceScope(admin, alpha.audience, scopes.write);
    const tokenCtx = await identity.anonymous();

    expect(await serviceClaims(tokenCtx, client, scopes.read, alpha.audience)).toMatchObject({ aud: alpha.audience, scope: scopes.read });
    await expectTokenError(await clientCredentialsGrant(tokenCtx, client, { scope: scopes.write, resource: alpha.audience }), 400, 'invalid_scope');
    expect(await serviceClaims(tokenCtx, client, scopes.beta, beta.audience)).toMatchObject({ aud: beta.audience, scope: scopes.beta });
    await expectTokenError(await clientCredentialsGrant(tokenCtx, client, { scope: scopes.read, resource: beta.audience }), 400, 'invalid_scope');
    expect(await serviceClaims(tokenCtx, client, `${scopes.run} ${scopes.profile}`, alpha.audience), 'a USER-only scope is dropped').toMatchObject({
      aud: alpha.audience,
      scope: scopes.run,
    });
    expect(await serviceClaims(tokenCtx, client, undefined, caller.audience), 'an application may mint for its own audience ungranted').toMatchObject({
      aud: caller.audience,
      scope: '',
    });
  });

  test('should stop issuing client-credentials tokens for a deactivated API resource', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const target = await identity.createOAuthApp('cc-target');
    const caller = await identity.createOAuthApp('cc-inactive');
    const scope = `${tag()}:read`;
    await grantOn(admin, target, caller.serviceClient, scope);
    const tokenCtx = await identity.anonymous();

    expect(await serviceClaims(tokenCtx, caller.serviceClient, scope, target.audience)).toMatchObject({ aud: target.audience, scope });
    await identityDb()`UPDATE api_resources SET is_active = false WHERE identifier = ${target.audience}`;
    await expectTokenError(await clientCredentialsGrant(tokenCtx, caller.serviceClient, { scope, resource: target.audience }), 400, 'invalid_target');
  });

  test('should never list a SERVICE-only scope on the user consent prompt', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const application = await identity.createOAuthApp('cc-consent');
    const client = await registerOAuthClient(admin, application, { isFirstParty: false });
    const scopes = { read: `${tag()}:read`, sync: `${tag()}:sync` };
    await createResourceScope(admin, application.audience, scopes.read, { principalType: 'USER' });
    await createResourceScope(admin, application.audience, scopes.sync, { principalType: 'SERVICE' });
    const { ctx } = await identity.signIn(await identity.createUser({ label: 'cc-consent' }));

    const query = new URLSearchParams({ clientId: client.clientId, scope: `openid ${scopes.read} ${scopes.sync}` });
    const prompt = await ctx.get(`/api/v1/auth/consent?${query.toString()}`);
    expect(prompt.status()).toBe(200);
    const { scopes: listed } = (await prompt.json()) as { scopes: { name: string }[] };
    expect(listed.map(scope => scope.name)).toEqual(['openid', scopes.read]);
  });

  test('should accept both the old and the new secret during a rotation’s overlap', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const application = await identity.createOAuthApp('cc-rotate');
    const original = application.serviceClient;
    const tokenCtx = await identity.anonymous();
    const mint = (secret: string | undefined): Promise<APIResponse> =>
      clientCredentialsGrant(tokenCtx, { clientId: original.clientId, secret }, { resource: application.audience });

    await accessTokenOf(await mint(original.secret));
    const requestedAt = Date.now();
    const rotated = await rotateClientSecret(admin, original.clientId);
    const answeredAt = Date.now();
    expect(rotated.secret).toBeTruthy();
    expect(rotated.secret).not.toBe(original.secret);
    const overlapEnd = Date.parse(rotated.previousSecretsExpireAt);
    expect(overlapEnd).toBeGreaterThanOrEqual(requestedAt + OVERLAP_MS - CLOCK_SKEW_MS);
    expect(overlapEnd).toBeLessThanOrEqual(answeredAt + OVERLAP_MS + CLOCK_SKEW_MS);
    const secrets = await identityDb()<{ expiresAt: Date | null }[]>`
      SELECT expires_at AS "expiresAt" FROM oauth_client_secrets WHERE client_id = ${original.clientId} AND revoked_at IS NULL ORDER BY created_at
    `;
    expect(
      secrets.map(secret => secret.expiresAt?.getTime() ?? null),
      'the old secret expires at the reported overlap end; the new one never',
    ).toEqual([overlapEnd, null]);

    await accessTokenOf(await mint(rotated.secret));
    await accessTokenOf(await mint(original.secret));
    await expectTokenError(await mint(randomBytes(32).toString('base64url')), 401, 'invalid_client');
  });
});
