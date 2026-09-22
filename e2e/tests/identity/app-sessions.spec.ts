/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  addOrganisationMember,
  type AppSessionApi,
  type AppSessionOrganisation,
  type AppTokenBody,
  assignOrganisationApplication,
  createAppSessionApi,
  createResourceScope,
  decodeJwt,
  deleteOAuthApplication,
  fetchJwks,
  grantClientScope,
  identityDb,
  identityMutate,
  type IdentitySession,
  type IdentityUser,
  type OAuthApplication,
  PLATFORM_AUDIENCE,
  releaseApplication,
  relyingPartyClient,
  revokeApplicationRelease,
  serviceToken,
  stepUp,
  unassignOrganisationApplication,
  verifyJwt,
} from '../../lib';
import { expect, type IdentityHarness, test } from './fixtures';
import { expectErrorCode } from './helpers';

/**
 * Defining types
 */

interface SessionApp {
  readonly application: OAuthApplication;
  readonly api: AppSessionApi;
  /** A non-sensitive scope the application declares on its own audience. */
  readonly readScope: string;
  /** A sensitive scope the application declares on its own audience, released only into stepped-up tokens. */
  readonly adminScope: string;
}

interface ElevationState {
  aal: string;
  elevated: boolean;
  intentClientId: string | null;
  intentResource: string | null;
}

/**
 * Declaring the constants
 *
 * First-party app sessions: a first-party application's back end turns an authorization code into an opaque session handle and
 * mints short-lived tokens from it, claims step-up elevations performed for it, and switches the organisation it acts in. Every
 * test registers its own applications with a public origin (so the provisioned client redirects to `<origin>/api/auth/callback`
 * like a real app), grants their clients `app-session:manage`, and signs users in through the database. A step-up uses the
 * account password, which identity accepts for an account with no second factor.
 */

function tag(): string {
  return `e2e${randomBytes(3).toString('hex')}`;
}

async function sessionApp(identity: IdentityHarness, label: string, visibility: 'PUBLIC' | 'RESTRICTED' = 'PUBLIC'): Promise<SessionApp> {
  const admin = (await identity.admin()).ctx;
  const application = await identity.createOAuthApp(label, { visibility, withPublicUrl: true });
  const readScope = `${tag()}:read`;
  const adminScope = `${tag()}:admin`;
  await createResourceScope(admin, application.audience, readScope);
  await createResourceScope(admin, application.audience, adminScope, { isSensitive: true });
  return { application, api: await createAppSessionApi(admin, await identity.anonymous(), application), readScope, adminScope };
}

function clientIdOf(app: SessionApp): string {
  return app.api.client.clientId;
}

async function tokenOf(response: APIResponse): Promise<AppTokenBody> {
  const body = (await response.json()) as AppTokenBody;
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body;
}

async function expectRefused(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status()).toBe(status);
  await expectErrorCode(response, code);
}

function scopesOf(body: AppTokenBody): string[] {
  return body.scope.split(' ').filter(Boolean);
}

async function organisationsOf(api: AppSessionApi, handle: string): Promise<AppSessionOrganisation[]> {
  const response = await api.organisations(handle);
  expect(response.status()).toBe(200);
  return ((await response.json()) as { organisations: AppSessionOrganisation[] }).organisations;
}

async function tokenOrganisation(api: AppSessionApi, handle: string): Promise<unknown> {
  return decodeJwt((await tokenOf(await api.mint({ sessionHandle: handle }))).accessToken).payload.org;
}

async function elevationOf(session: IdentitySession): Promise<ElevationState> {
  const [row] = await identityDb()<ElevationState[]>`
    SELECT aal, coalesce(elevated_until > now(), false) AS elevated, elevation_intent_client_id AS "intentClientId", elevation_intent_resource AS "intentResource"
    FROM user_sessions WHERE id = ${session.sessionId}
  `;
  if (!row) throw new Error(`session ${session.sessionId} vanished`);
  return row;
}

async function expectStepUp(ctx: APIRequestContext, user: IdentityUser, intent: { clientId?: string; resource?: string }): Promise<void> {
  const response = await stepUp(ctx, { password: user.password, ...intent });
  expect(response.status(), await response.text()).toBe(200);
  expect(await response.json()).toMatchObject({ aal: 'AAL2' });
}

test.describe('identity app sessions — create and mint', () => {
  test('should mint tokens bound to the user, audience and central session, only for the client that owns the handle and only while the central session lives', async ({
    identity,
  }) => {
    const app = await sessionApp(identity, 'appsess');
    const foreign = await sessionApp(identity, 'appsess-foreign');
    const user = await identity.createUser({ label: 'appsess' });
    const { session, ctx } = await identity.signIn(user);
    const jwks = await fetchJwks(await identity.anonymous());

    const opened = await app.api.open(ctx, { scope: 'openid' });
    expect(opened.userId).toBe(user.userId);
    expect(opened.handle).toMatch(/^[\w-]{43}$/);

    const minted = await tokenOf(await app.api.mint({ sessionHandle: opened.handle, resource: app.application.audience }));
    expect(minted).toMatchObject({ tokenType: 'Bearer', aal: 'AAL1', audience: app.application.audience });
    expect(verifyJwt(minted.accessToken, jwks)).toMatchObject({
      sub: user.sub,
      aud: app.application.audience,
      sid: session.sessionId,
      client_id: clientIdOf(app),
      org: user.personalOrgId,
      aal: 'AAL1',
      token_type: 'user',
    });

    await expectRefused(await foreign.api.mint({ sessionHandle: opened.handle }), 401, 'AUTH_005');
    await tokenOf(await app.api.mint({ sessionHandle: opened.handle }));

    expect((await identityMutate(ctx, 'post', '/api/v1/auth/signout')).status()).toBe(204);
    await expectRefused(await app.api.mint({ sessionHandle: opened.handle }), 401, 'AUTH_005');
    const [row] = await identityDb()<{ status: string }[]>`SELECT status FROM app_sessions WHERE client_id = ${clientIdOf(app)} AND user_id = ${user.userId}`;
    expect(row?.status, 'the app session dies with its central session').toBe('REVOKED');
  });

  test('should let an application’s own client mint for its own audience and declared scopes and drop any scope it neither owns nor holds', async ({ identity }) => {
    const app = await sessionApp(identity, 'appsess-own');
    const other = await sessionApp(identity, 'appsess-other');
    const user = await identity.createUser({ label: 'appsess-own' });
    const { ctx } = await identity.signIn(user);
    const audience = app.application.audience;

    const opened = await app.api.open(ctx, { scope: `openid ${app.readScope} ${app.adminScope} ${other.readScope}`, resource: audience });
    expect(opened.scope.split(' ').sort()).toEqual(['openid', app.adminScope, app.readScope].sort());

    const own = await tokenOf(await app.api.mint({ sessionHandle: opened.handle, resource: audience, scope: `${app.readScope} ${other.readScope}` }));
    expect(own).toMatchObject({ audience, scope: app.readScope });
    const full = await tokenOf(await app.api.mint({ sessionHandle: opened.handle, resource: audience }));
    expect(scopesOf(full), 'the sensitive scope needs a claimed step-up').not.toContain(app.adminScope);
    expect(scopesOf(full)).toContain(app.readScope);

    await expectRefused(await app.api.mint({ sessionHandle: opened.handle, resource: other.application.audience }), 400, 'invalid_target');
  });
});

test.describe('identity app sessions — the calling application', () => {
  test('should describe only the calling application to a service token and refuse no token or a vanished client', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const app = await sessionApp(identity, 'self');
    const other = await sessionApp(identity, 'self-other');
    const syncScope = `${tag()}:sync`;
    await grantClientScope(admin, clientIdOf(app), await createResourceScope(admin, other.application.audience, syncScope));
    const anonymous = await identity.anonymous();
    const client = relyingPartyClient(app.application);
    const describe = (token?: string): Promise<APIResponse> => anonymous.get('/api/v1/apps/me', token ? { headers: { authorization: `Bearer ${token}` } } : {});

    const token = await serviceToken(anonymous, client);
    expect(decodeJwt(token).payload.scope, 'no scope is needed').toBe('');
    const response = await describe(token);
    expect(response.status()).toBe(200);
    const self = (await response.json()) as Record<string, unknown> & { grants: { audience: string; scopes: string[] }[] };
    expect({ ...self, grants: [...self.grants].sort((left, right) => left.audience.localeCompare(right.audience)) }).toEqual({
      appId: app.application.name,
      isFirstParty: true,
      audience: app.application.audience,
      redirectUris: [client.redirectUri],
      scopes: [app.readScope],
      sensitiveScopes: [app.adminScope],
      grants: [
        { audience: other.application.audience, scopes: [syncScope] },
        { audience: PLATFORM_AUDIENCE, scopes: ['app-session:manage'] },
      ].sort((left, right) => left.audience.localeCompare(right.audience)),
      accessTokenTtl: expect.any(Number),
    });

    await expectRefused(await describe(), 401, 'SEC_003');

    const vanishing = await identity.createOAuthApp('self-vanish');
    const vanishingToken = await serviceToken(anonymous, vanishing.serviceClient);
    expect((await describe(vanishingToken)).status()).toBe(200);
    await deleteOAuthApplication(admin, vanishing);
    await expectRefused(await describe(vanishingToken), 401, 'invalid_client');
  });
});

test.describe('identity app sessions — step-up elevation', () => {
  test('should release a sensitive scope only after a step-up for this client and resource is claimed, and let each step-up be claimed once', async ({ identity }) => {
    const app = await sessionApp(identity, 'elevate');
    const user = await identity.createUser({ label: 'elevate' });
    const { session, ctx } = await identity.signIn(user);
    const audience = app.application.audience;
    const { handle } = await app.api.open(ctx, { scope: `openid ${app.readScope} ${app.adminScope}`, resource: audience });

    const ordinary = await tokenOf(await app.api.mint({ sessionHandle: handle, resource: audience }));
    expect(ordinary.aal).toBe('AAL1');
    expect(scopesOf(ordinary)).toContain(app.readScope);
    expect(scopesOf(ordinary)).not.toContain(app.adminScope);
    await expectRefused(await app.api.mint({ sessionHandle: handle, resource: audience, elevated: true }), 403, 'AUTH_006');
    await expectRefused(await app.api.claimElevation(handle, audience), 403, 'AUTH_006');

    await expectStepUp(ctx, user, { clientId: clientIdOf(app), resource: audience });
    expect(await elevationOf(session)).toEqual({ aal: 'AAL2', elevated: true, intentClientId: clientIdOf(app), intentResource: audience });
    const claimed = await app.api.claimElevation(handle, audience);
    expect(claimed.status()).toBe(200);
    expect(Date.parse(((await claimed.json()) as { expiresAt: string }).expiresAt)).toBeGreaterThan(Date.now());

    const elevated = await tokenOf(await app.api.mint({ sessionHandle: handle, resource: audience, elevated: true }));
    expect(elevated.aal).toBe('AAL2');
    expect(scopesOf(elevated)).toEqual(expect.arrayContaining([app.readScope, app.adminScope]));
    expect(verifyJwt(elevated.accessToken, await fetchJwks(ctx))).toMatchObject({ aal: 'AAL2', aud: audience });

    await expectRefused(await app.api.claimElevation(handle, audience), 403, 'AUTH_006');
    expect(await elevationOf(session), 'the claim spends the parent session’s elevation and intent').toEqual({
      aal: 'AAL2',
      elevated: false,
      intentClientId: null,
      intentResource: null,
    });
    const me = await ctx.get('/api/v1/me');
    expect(await me.json()).toMatchObject({ aal: 'AAL2', elevated: false });
  });

  test('should keep a step-up claimable only by the client and resource it was performed for, and a console step-up by no application', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const alpha = await sessionApp(identity, 'elevate-a');
    const beta = await sessionApp(identity, 'elevate-b');
    await grantClientScope(admin, clientIdOf(alpha), await createResourceScope(admin, beta.application.audience, `${tag()}:use`));
    const user = await identity.createUser({ label: 'elevate-iso' });
    const { session, ctx } = await identity.signIn(user);
    const alphaAudience = alpha.application.audience;
    const betaAudience = beta.application.audience;
    const alphaHandle = (await alpha.api.open(ctx, { scope: `openid ${alpha.readScope} ${alpha.adminScope}`, resource: alphaAudience })).handle;
    const betaHandle = (await beta.api.open(ctx, { scope: `openid ${beta.readScope} ${beta.adminScope}`, resource: betaAudience })).handle;

    await expectStepUp(ctx, user, {});
    expect(await elevationOf(session), 'a console step-up records no intent').toEqual({ aal: 'AAL2', elevated: true, intentClientId: null, intentResource: null });
    await expectRefused(await alpha.api.claimElevation(alphaHandle, alphaAudience), 403, 'AUTH_006');
    await expectRefused(await beta.api.claimElevation(betaHandle, betaAudience), 403, 'AUTH_006');

    await expectStepUp(ctx, user, { clientId: clientIdOf(alpha), resource: alphaAudience });
    await expectRefused(await beta.api.claimElevation(betaHandle, betaAudience), 403, 'AUTH_006');
    await expectRefused(await beta.api.claimElevation(betaHandle, alphaAudience), 403, 'AUTH_006');
    await expectRefused(await beta.api.mint({ sessionHandle: betaHandle, resource: betaAudience, elevated: true }), 403, 'AUTH_006');

    expect((await alpha.api.claimElevation(alphaHandle, alphaAudience)).status(), 'the refused claims left the step-up intact').toBe(200);
    await tokenOf(await alpha.api.mint({ sessionHandle: alphaHandle, resource: betaAudience }));
    await expectRefused(await alpha.api.mint({ sessionHandle: alphaHandle, resource: betaAudience, elevated: true }), 403, 'AUTH_006');
    expect((await tokenOf(await alpha.api.mint({ sessionHandle: alphaHandle, resource: alphaAudience, elevated: true }))).aal).toBe('AAL2');
  });

  test('should default a client step-up to the platform audience and record nothing for an unknown client', async ({ identity }) => {
    const app = await sessionApp(identity, 'elevate-default');
    const user = await identity.createUser({ label: 'elevate-default' });
    const { session, ctx } = await identity.signIn(user);
    const { handle } = await app.api.open(ctx, { scope: 'openid' });

    const unknown = await stepUp(ctx, { password: user.password, clientId: `e2e-unknown-${randomBytes(4).toString('hex')}`, resource: app.application.audience });
    await expectRefused(unknown, 401, 'invalid_client');
    expect(await elevationOf(session)).toEqual({ aal: 'AAL1', elevated: false, intentClientId: null, intentResource: null });
    const [audit] = await identityDb()<{ count: number }[]>`SELECT count(*)::int AS count FROM audit_events WHERE action = 'auth.mfa.step_up' AND actor_id = ${user.userId}`;
    expect(audit?.count).toBe(0);

    await expectStepUp(ctx, user, { clientId: clientIdOf(app) });
    expect(await elevationOf(session)).toMatchObject({ intentClientId: clientIdOf(app), intentResource: PLATFORM_AUDIENCE });
    expect((await app.api.claimElevation(handle)).status()).toBe(200);
    expect(await tokenOf(await app.api.mint({ sessionHandle: handle, elevated: true }))).toMatchObject({ aal: 'AAL2', audience: PLATFORM_AUDIENCE });
  });
});

test.describe('identity app sessions — organisations', () => {
  test('should open in the personal workspace, list every granting organisation and switch only into one of them on a rotated handle', async ({ identity }) => {
    const app = await sessionApp(identity, 'orgs');
    const user = await identity.createUser({ label: 'orgs' });
    const granting = await identity.createTeam({ label: 'orgs-granting' });
    const withholding = await identity.createTeam({ label: 'orgs-withholding', appAccessMode: 'ASSIGNED_ONLY' });
    await addOrganisationMember(granting.organisationId, user.userId);
    await addOrganisationMember(withholding.organisationId, user.userId);
    const { ctx } = await identity.signIn(user);
    const { handle } = await app.api.open(ctx, { scope: 'openid' });

    expect(await tokenOrganisation(app.api, handle)).toBe(user.personalOrgId);
    const listed = await organisationsOf(app.api, handle);
    expect(listed.map(({ id, type, active }) => ({ id, type, active })).sort((left, right) => Number(left.id) - Number(right.id))).toEqual([
      { id: user.personalOrgId, type: 'PERSONAL', active: true },
      { id: granting.organisationId, type: 'TEAM', active: false },
    ]);

    await expectRefused(await app.api.switchOrganisation(handle, withholding.organisationId), 403, 'APP_007');
    await tokenOf(await app.api.mint({ sessionHandle: handle }));

    const switched = await app.api.switchOrganisation(handle, granting.organisationId);
    expect(switched.status()).toBe(200);
    const { sessionHandle, organisationId } = (await switched.json()) as { sessionHandle: string; organisationId: string };
    expect(organisationId).toBe(granting.organisationId);
    expect(sessionHandle).not.toBe(handle);
    expect(await tokenOrganisation(app.api, sessionHandle)).toBe(granting.organisationId);
    expect((await organisationsOf(app.api, sessionHandle)).find(organisation => organisation.active)?.id).toBe(granting.organisationId);
    await expectRefused(await app.api.mint({ sessionHandle: handle }), 401, 'AUTH_005');
  });

  test('should realign a session onto another granting organisation and end it once none grants the app', async ({ identity }) => {
    const admin = (await identity.admin()).ctx;
    const app = await sessionApp(identity, 'realign', 'RESTRICTED');
    const first = await identity.createTeam({ label: 'realign-first' });
    const second = await identity.createTeam({ label: 'realign-second' });
    const user = await identity.createUser({ label: 'realign' });
    for (const team of [first, second]) {
      await releaseApplication(admin, app.application.applicationId, team.organisationId);
      await addOrganisationMember(team.organisationId, user.userId);
    }
    const { ctx } = await identity.signIn(user);
    const { handle } = await app.api.open(ctx, { scope: 'openid' });
    expect(await tokenOrganisation(app.api, handle), 'with no granting default or personal org, the lowest id wins').toBe(first.organisationId);

    await revokeApplicationRelease(admin, app.application.applicationId, first.organisationId);
    expect(await tokenOrganisation(app.api, handle)).toBe(second.organisationId);

    await revokeApplicationRelease(admin, app.application.applicationId, second.organisationId);
    await expectRefused(await app.api.mint({ sessionHandle: handle }), 401, 'AUTH_005');
    await releaseApplication(admin, app.application.applicationId, second.organisationId);
    await expectRefused(await app.api.mint({ sessionHandle: handle }), 401, 'AUTH_005');
  });

  test('should end the app session when its organisation unassigns the app and not revive it on reassignment', async ({ identity }) => {
    const app = await sessionApp(identity, 'unassign', 'RESTRICTED');
    const team = await identity.createTeam({ label: 'unassign', appAccessMode: 'ASSIGNED_ONLY' });
    await releaseApplication((await identity.admin()).ctx, app.application.applicationId, team.organisationId);
    await assignOrganisationApplication(team.ownerCtx, team.organisationId, app.application.applicationId);
    const user = await identity.createUser({ label: 'unassign' });
    await addOrganisationMember(team.organisationId, user.userId);
    const { ctx } = await identity.signIn(user);
    const { handle } = await app.api.open(ctx, { scope: 'openid' });
    await tokenOf(await app.api.mint({ sessionHandle: handle }));

    await unassignOrganisationApplication(team.ownerCtx, team.organisationId, app.application.applicationId);
    await expectRefused(await app.api.mint({ sessionHandle: handle }), 401, 'AUTH_005');
    await assignOrganisationApplication(team.ownerCtx, team.organisationId, app.application.applicationId);
    await expectRefused(await app.api.mint({ sessionHandle: handle }), 401, 'AUTH_005');

    const fresh = await app.api.open(ctx, { scope: 'openid' });
    expect(await tokenOrganisation(app.api, fresh.handle)).toBe(team.organisationId);
  });
});
