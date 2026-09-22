/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  authorize,
  type AuthorizeRedirect,
  createResourceScope,
  identityDb,
  identityMutate,
  introspect,
  issueTokens,
  type OAuthTestClient,
  registerOAuthClient,
  requireProductUrl,
} from '../../lib';
import { expect, test } from './fixtures';
import { expectErrorCode } from './helpers';

/**
 * Defining types
 */

type ConsentDecision = 'APPROVE' | 'DENY';

interface ConsentDecisionRequest {
  scopeNames: string[];
  decision: ConsentDecision;
  redirectUri?: string;
  state?: string;
}

interface ConsentRow {
  scopeNames: string[];
  source: string;
  revoked: boolean;
}

interface LauncherEntry {
  id: number;
  name: string;
  firstUsedAt?: string;
}

/**
 * Declaring the constants
 *
 * The consent surface behind identity's authorize endpoint: the prompt a third-party client triggers, the user's decisions, how
 * a recorded consent gates later authorizations, the first-party policy that skips the prompt, and withdrawal. Each test registers
 * its own application and clients and signs its users in through the database.
 */

const ISSUER = new URL(requireProductUrl('identity')).origin;

function consentPrompt(ctx: APIRequestContext, clientId: string, scope: string): Promise<APIResponse> {
  return ctx.get(`/api/v1/auth/consent?${new URLSearchParams({ clientId, scope }).toString()}`);
}

function decideConsent(ctx: APIRequestContext, clientId: string, request: ConsentDecisionRequest): Promise<APIResponse> {
  return identityMutate(ctx, 'post', '/api/v1/auth/consent', { clientId, ...request });
}

async function approve(ctx: APIRequestContext, clientId: string, scopeNames: string[]): Promise<void> {
  const response = await decideConsent(ctx, clientId, { scopeNames, decision: 'APPROVE' });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ decision: 'APPROVE' });
}

function authorizeFor(ctx: APIRequestContext, client: OAuthTestClient, scope: string): Promise<AuthorizeRedirect> {
  return authorize(ctx, { clientId: client.clientId, redirectUri: client.redirectUri, scope, state: randomBytes(8).toString('hex') });
}

function expectConsentRequired(redirect: AuthorizeRedirect): void {
  expect(redirect.status).toBe(302);
  expect(`${redirect.location?.origin}${redirect.location?.pathname}`, 'consent is collected on identity’s login page').toBe(`${ISSUER}/login`);
  expect(redirect.location?.searchParams.get('return_to')).toMatch(new RegExp(`^${ISSUER}/oauth2/authorize\\?`));
}

function expectCode(redirect: AuthorizeRedirect, client: OAuthTestClient): void {
  expect(redirect.status).toBe(302);
  expect(`${redirect.location?.origin}${redirect.location?.pathname}`).toBe(client.redirectUri);
  expect(redirect.location?.searchParams.get('code')).toBeTruthy();
}

async function consentRows(userId: string, clientId: string): Promise<ConsentRow[]> {
  return identityDb()<ConsentRow[]>`
    SELECT scope_names AS "scopeNames", source, revoked_at IS NOT NULL AS revoked FROM consents WHERE user_id = ${userId} AND client_id = ${clientId} ORDER BY granted_at
  `;
}

async function launcherEntry(ctx: APIRequestContext, applicationId: number): Promise<LauncherEntry | undefined> {
  const response = await ctx.get('/api/v1/me/applications');
  expect(response.status()).toBe(200);
  const { applications } = (await response.json()) as { applications: LauncherEntry[] };
  expect(
    applications.map(application => application.name),
    'identity never lists itself',
  ).not.toContain('shadow-identity');
  return applications.find(application => application.id === applicationId);
}

test.describe('identity consent — prompt and decisions', () => {
  test('should describe the signed-in user and refuse an anonymous caller', async ({ identity }) => {
    const user = await identity.createUser({ label: 'me', firstName: 'Grace', lastName: 'Hopper' });
    const { ctx } = await identity.signIn(user);

    const me = await ctx.get('/api/v1/me');
    expect(me.status()).toBe(200);
    expect(await me.json()).toEqual({ userId: user.userId, firstName: 'Grace', lastName: 'Hopper', email: user.email, aal: 'AAL1', elevated: false });

    const anonymous = await (await identity.anonymous()).get('/api/v1/me');
    expect(anonymous.status()).toBe(401);
    await expectErrorCode(anonymous, 'AUTH_005');
  });

  test('should prompt for a third-party client’s scopes and gate authorize on the recorded decision', async ({ identity }) => {
    const application = await identity.createOAuthApp('consent');
    const client = await registerOAuthClient((await identity.admin()).ctx, application, { isFirstParty: false });
    const user = await identity.createUser({ label: 'consent' });
    const { ctx } = await identity.signIn(user);

    const prompt = await consentPrompt(ctx, client.clientId, 'openid email');
    expect(prompt.status()).toBe(200);
    expect(await prompt.json()).toEqual({
      clientName: `${client.clientId} client`,
      isFirstParty: false,
      alreadyGranted: false,
      scopes: [
        { name: 'openid', description: 'Confirm your identity', isSensitive: false },
        { name: 'email', description: 'Read your primary email address', isSensitive: false },
      ],
    });

    const unknown = await consentPrompt(ctx, `e2e-unknown-${randomBytes(4).toString('hex')}`, 'openid');
    expect(unknown.status()).toBe(400);
    expect(await unknown.json()).toEqual({ code: 'invalid_request', message: expect.any(String) });

    expectConsentRequired(await authorizeFor(ctx, client, 'openid email'));
    expect(await consentRows(user.userId, client.clientId)).toEqual([]);

    await approve(ctx, client.clientId, ['openid', 'email']);
    expect(await (await consentPrompt(ctx, client.clientId, 'openid email')).json()).toMatchObject({ alreadyGranted: true });
    expectCode(await authorizeFor(ctx, client, 'openid email'), client);
    expect(await consentRows(user.userId, client.clientId)).toEqual([{ scopeNames: ['openid', 'email'], source: 'USER', revoked: false }]);

    const state = randomBytes(8).toString('hex');
    const denied = await decideConsent(ctx, client.clientId, { scopeNames: ['openid'], decision: 'DENY', redirectUri: client.redirectUri, state });
    expect(denied.status()).toBe(200);
    const { redirectTo } = (await denied.json()) as { redirectTo?: string };
    const redirect = new URL(redirectTo ?? '');
    expect(`${redirect.origin}${redirect.pathname}`).toBe(client.redirectUri);
    expect(Object.fromEntries(redirect.searchParams)).toEqual({ error: 'access_denied', state });

    const deniedElsewhere = await decideConsent(ctx, client.clientId, { scopeNames: ['openid'], decision: 'DENY', redirectUri: 'https://evil.example.test/cb', state });
    expect(deniedElsewhere.status()).toBe(200);
    expect(await deniedElsewhere.json(), 'an unregistered URI must never come back as a redirect').toEqual({ decision: 'DENY' });

    const anonymous = await decideConsent(await identity.anonymous(), client.clientId, { scopeNames: ['openid'], decision: 'APPROVE' });
    expect(anonymous.status()).toBe(401);
    await expectErrorCode(anonymous, 'AUTH_005');
  });
});

test.describe('identity consent — scope changes and policy', () => {
  test('should re-prompt for widened scopes and store only the scopes the client is entitled to', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const application = await identity.createOAuthApp('consent-widen');
    const client = await registerOAuthClient(admin, application, { isFirstParty: false });
    const ownScope = `e2e${randomBytes(3).toString('hex')}:read`;
    await createResourceScope(admin, application.audience, ownScope);
    const user = await identity.createUser({ label: 'consent-widen' });
    const inflator = await identity.createUser({ label: 'consent-inflate' });
    const { ctx } = await identity.signIn(user);
    const { ctx: inflatorCtx } = await identity.signIn(inflator);

    await approve(ctx, client.clientId, ['openid']);
    expectCode(await authorizeFor(ctx, client, 'openid'), client);
    expectConsentRequired(await authorizeFor(ctx, client, 'openid profile'));
    expect(await (await consentPrompt(ctx, client.clientId, 'openid profile')).json()).toMatchObject({ alreadyGranted: false });
    await approve(ctx, client.clientId, ['openid', 'profile']);
    expectCode(await authorizeFor(ctx, client, 'openid profile'), client);
    expect(await consentRows(user.userId, client.clientId)).toEqual([{ scopeNames: ['openid', 'profile'], source: 'USER', revoked: false }]);

    await approve(inflatorCtx, client.clientId, ['openid', ownScope, 'ghost:write']);
    expect(await consentRows(inflator.userId, client.clientId)).toEqual([{ scopeNames: ['openid', ownScope], source: 'USER', revoked: false }]);
  });

  test('should skip the prompt for a first-party client, surface it in the launcher, and revoke its refresh tokens on withdrawal', async ({ identity }) => {
    const application = await identity.createOAuthApp('consent-first');
    const client = await registerOAuthClient((await identity.admin()).ctx, application, { kind: 'WEB_CONFIDENTIAL' });
    const user = await identity.createUser({ label: 'consent-first' });
    const { ctx } = await identity.signIn(user);
    const tokenCtx = await identity.anonymous();

    const beforeUse = await launcherEntry(ctx, application.applicationId);
    expect(beforeUse?.name, 'a PUBLIC application is listed before its first use').toBe(application.name);
    expect(beforeUse).not.toHaveProperty('firstUsedAt');
    const { refreshToken } = await issueTokens(ctx, tokenCtx, client);
    expect(await consentRows(user.userId, client.clientId)).toEqual([{ scopeNames: ['openid', 'offline_access'], source: 'FIRST_PARTY_POLICY', revoked: false }]);
    const members = await identityDb()<{ count: number }[]>`
      SELECT count(*)::int AS count FROM application_members WHERE application_id = ${application.applicationId} AND user_id = ${user.userId}
    `;
    expect(members).toEqual([{ count: 1 }]);
    expect((await launcherEntry(ctx, application.applicationId))?.firstUsedAt, 'the first consent provisions the membership').toEqual(expect.any(String));
    expect((await (await identity.anonymous()).get('/api/v1/me/applications')).status()).toBe(401);

    const listed = await ctx.get('/api/v1/me/consents');
    expect(listed.status()).toBe(200);
    const { items } = (await listed.json()) as { items: Record<string, unknown>[] };
    expect(items).toEqual([
      expect.objectContaining({ clientId: client.clientId, applicationName: application.name, scopeNames: ['openid', 'offline_access'], source: 'FIRST_PARTY_POLICY' }),
    ]);

    expect(await introspect(tokenCtx, client, refreshToken)).toMatchObject({ active: true, token_type: 'refresh_token' });
    const withdrawn = await identityMutate(ctx, 'delete', `/api/v1/me/consents/${client.clientId}`);
    expect(withdrawn.status()).toBe(200);
    expect(await withdrawn.json()).toEqual({ success: true });
    expect(await introspect(tokenCtx, client, refreshToken)).toEqual({ active: false });
    expect(await consentRows(user.userId, client.clientId)).toEqual([{ scopeNames: ['openid', 'offline_access'], source: 'FIRST_PARTY_POLICY', revoked: true }]);
    expect(await (await ctx.get('/api/v1/me/consents')).json()).toEqual({ items: [] });
  });
});
