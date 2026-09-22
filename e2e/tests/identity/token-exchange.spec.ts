/**
 * Importing npm packages
 */
import { randomBytes } from 'node:crypto';

import { type APIRequestContext, type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import {
  ACCESS_TOKEN_TYPE,
  addOrganisationMember,
  type AppSessionApi,
  createAppSessionApi,
  createResourceScope,
  decodeJwt,
  exchangeToken,
  fetchJwks,
  grantClientScope,
  ID_TOKEN_TYPE,
  type IdentityUser,
  issueTokens,
  type Jwks,
  type JwtClaims,
  type OAuthApplication,
  type OAuthClientCredentials,
  type OAuthTestClient,
  registerOAuthClient,
  releaseApplication,
  serviceToken,
  stepUp,
  tokenExchangeGrant,
  type TokenResponseBody,
  verifyJwt,
} from '../../lib';
import { expect, type IdentityHarness, test } from './fixtures';

/**
 * Defining types
 */

interface ExchangeFixture {
  /** The application whose audience every subject token below is minted for, and whose confidential client performs the exchange. */
  readonly caller: OAuthApplication;
  readonly callerCredentials: OAuthClientCredentials;
  /** A public client on the caller application, issuing short-lived subject tokens so the lifetime bound is unambiguous. */
  readonly subjectClient: OAuthTestClient;
  readonly target: OAuthApplication;
  readonly readScope: string;
  readonly writeScope: string;
  /** Declared on the target and granted to the caller, yet never reachable through an exchange. */
  readonly sensitiveScope: string;
  readonly ctx: APIRequestContext;
  readonly jwks: Jwks;
}

/**
 * Declaring the constants
 *
 * RFC 8693 delegation: a first-party back end trades a user's access token for one addressed to another application, carrying
 * the same user but naming itself as the actor. Each test builds its own caller and target applications, declares the target's
 * scopes and grants them to the caller, and mints subject tokens through the authorization-code flow on a database-minted
 * session. Subject tokens are deliberately short-lived (60 s, the client TTL floor) so the exchanged lifetime can be checked
 * against the subject's remainder rather than against the caller's own hour-long ceiling.
 */

const SUBJECT_TOKEN_TTL = 60;

function tag(): string {
  return `e2e${randomBytes(3).toString('hex')}`;
}

async function tokenBody(response: APIResponse): Promise<TokenResponseBody> {
  return (await response.json()) as TokenResponseBody;
}

async function expectExchangeError(response: APIResponse, code: string): Promise<void> {
  const body = await tokenBody(response);
  expect(response.status(), JSON.stringify(body)).toBe(400);
  expect(body.code).toBe(code);
  expect(body.access_token, 'a refused exchange must not carry a token').toBeUndefined();
}

function scopesOf(body: TokenResponseBody): string[] {
  return (body.scope ?? '').split(' ').filter(Boolean).sort();
}

async function exchangeFixture(identity: IdentityHarness, label: string): Promise<ExchangeFixture> {
  const admin = (await identity.admin()).ctx;
  const caller = await identity.createOAuthApp(`tx-${label}`);
  const target = await identity.createOAuthApp(`tx-${label}-target`);
  const subjectClient = await registerOAuthClient(admin, caller, { suffix: 'subject', accessTokenTtl: SUBJECT_TOKEN_TTL });
  const [readScope, writeScope, sensitiveScope] = [`${tag()}:read`, `${tag()}:write`, `${tag()}:admin`];

  for (const [name, isSensitive] of [
    [readScope, false],
    [writeScope, false],
    [sensitiveScope, true],
  ] as const) {
    const scopeId = await createResourceScope(admin, target.audience, name, { isSensitive });
    await grantClientScope(admin, caller.serviceClient.clientId, scopeId);
  }

  const ctx = await identity.anonymous();
  return { caller, callerCredentials: caller.serviceClient, subjectClient, target, readScope, writeScope, sensitiveScope, ctx, jwks: await fetchJwks(ctx) };
}

/** An access token for `user` addressed to `client`'s own application, the only audience its application's clients may delegate. */
async function subjectTokenFor(identity: IdentityHarness, client: OAuthTestClient, application: OAuthApplication, user: IdentityUser): Promise<string> {
  const { ctx } = await identity.signIn(user);
  return (await issueTokens(ctx, await identity.anonymous(), client, { resource: application.audience })).accessToken;
}

/** An app-session token elevated to AAL2 — the only user access token identity mints with an `aal` claim. */
async function elevatedAppToken(identity: IdentityHarness, api: AppSessionApi, application: OAuthApplication, user: IdentityUser): Promise<string> {
  const { ctx } = await identity.signIn(user);
  const { handle } = await api.open(ctx, { scope: 'openid' });
  const stepped = await stepUp(ctx, { password: user.password, clientId: api.client.clientId, resource: application.audience });
  expect(stepped.status(), await stepped.text()).toBe(200);
  expect((await api.claimElevation(handle, application.audience)).status()).toBe(200);

  const minted = await api.mint({ sessionHandle: handle, resource: application.audience, elevated: true });
  const body = (await minted.json()) as { accessToken: string; aal: string };
  expect(minted.status(), JSON.stringify(body)).toBe(200);
  expect(body.aal).toBe('AAL2');
  return body.accessToken;
}

test.describe('identity token exchange', () => {
  test('should mint a delegated token carrying the subject identity, the caller as actor and no more lifetime than the subject', async ({ identity }) => {
    const fixture = await exchangeFixture(identity, 'happy');
    const user = await identity.createUser({ label: 'tx-happy' });
    const subject = await subjectTokenFor(identity, fixture.subjectClient, fixture.caller, user);
    const subjectClaims = verifyJwt(subject, fixture.jwks);

    const body = await exchangeToken(fixture.ctx, fixture.callerCredentials, { subjectToken: subject, resource: fixture.target.audience });
    expect(body.issued_token_type).toBe(ACCESS_TOKEN_TYPE);
    expect(body.token_type).toBe('Bearer');
    expect(body.refresh_token, 'an exchange never hands out a refresh token').toBeUndefined();

    const claims = verifyJwt(body.access_token ?? '', fixture.jwks);
    expect(claims).toMatchObject({
      sub: subjectClaims.sub,
      org: subjectClaims.org,
      sid: subjectClaims.sid,
      aud: fixture.target.audience,
      client_id: fixture.callerCredentials.clientId,
      token_type: 'user',
      act: { sub: fixture.callerCredentials.clientId },
    });
    expect(scopesOf(body), 'the default scope is every granted non-sensitive scope on the target').toEqual([fixture.readScope, fixture.writeScope].sort());
    expect(scopesOf(body)).not.toContain(fixture.sensitiveScope);
    expect(Number(claims.exp), 'a delegated token never outlives the token it came from').toBeLessThanOrEqual(Number(subjectClaims.exp));
    expect(body.expires_in).toBeGreaterThan(0);
    expect(body.expires_in).toBeLessThanOrEqual(SUBJECT_TOKEN_TTL);
  });

  test('should bound the exchanged scope by the caller grants on the target and never release a sensitive scope', async ({ identity }) => {
    const fixture = await exchangeFixture(identity, 'scope');
    const user = await identity.createUser({ label: 'tx-scope' });
    const subject = await subjectTokenFor(identity, fixture.subjectClient, fixture.caller, user);
    const exchange = (scope?: string): Promise<APIResponse> =>
      tokenExchangeGrant(fixture.ctx, fixture.callerCredentials, { subjectToken: subject, resource: fixture.target.audience, scope });

    const narrowed = await tokenBody(await exchange(fixture.readScope));
    expect(scopesOf(narrowed)).toEqual([fixture.readScope]);

    await expectExchangeError(await exchange(`${tag()}:unknown`), 'invalid_scope');
    await expectExchangeError(await exchange(fixture.sensitiveScope), 'invalid_scope');
    await expectExchangeError(await exchange(`${fixture.readScope} ${fixture.sensitiveScope}`), 'invalid_scope');

    expect(scopesOf(await tokenBody(await exchange(`${fixture.readScope} ${fixture.writeScope}`)))).toEqual([fixture.readScope, fixture.writeScope].sort());
  });

  test('should drop the authentication level when delegating an AAL2 token', async ({ identity }) => {
    const fixture = await exchangeFixture(identity, 'aal');
    const admin = (await identity.admin()).ctx;
    const application = await identity.createOAuthApp('tx-aal-app', { withPublicUrl: true });
    const api = await createAppSessionApi(admin, await identity.anonymous(), application);
    await grantClientScope(admin, api.client.clientId, await createResourceScope(admin, fixture.target.audience, `${tag()}:read`));

    const user = await identity.createUser({ label: 'tx-aal' });
    const subject = await elevatedAppToken(identity, api, application, user);
    const subjectClaims = verifyJwt(subject, fixture.jwks);
    expect(subjectClaims.aal).toBe('AAL2');

    const body = await exchangeToken(fixture.ctx, api.client, { subjectToken: subject, resource: fixture.target.audience });
    const claims = verifyJwt(body.access_token ?? '', fixture.jwks);
    expect(claims.aal, 'a delegated token never inherits the subject step-up').toBeUndefined();
    expect(claims).toMatchObject({ sub: subjectClaims.sub, sid: subjectClaims.sid, act: { sub: api.client.clientId } });
  });

  test('should refuse a second hop and a subject token whose audience the caller does not own', async ({ identity }) => {
    const fixture = await exchangeFixture(identity, 'hop');
    const admin = (await identity.admin()).ctx;
    const user = await identity.createUser({ label: 'tx-hop' });
    const subject = await subjectTokenFor(identity, fixture.subjectClient, fixture.caller, user);
    const delegated = await exchangeToken(fixture.ctx, fixture.callerCredentials, { subjectToken: subject, resource: fixture.target.audience });

    const secondHop = await tokenExchangeGrant(fixture.ctx, fixture.callerCredentials, { subjectToken: delegated.access_token, resource: fixture.target.audience });
    await expectExchangeError(secondHop, 'invalid_grant');

    const foreignClient = await registerOAuthClient(admin, fixture.target, { suffix: 'foreign' });
    const foreign = await subjectTokenFor(identity, foreignClient, fixture.target, user);
    await expectExchangeError(await tokenExchangeGrant(fixture.ctx, fixture.callerCredentials, { subjectToken: foreign, resource: fixture.target.audience }), 'invalid_grant');

    expect((await exchangeToken(fixture.ctx, fixture.callerCredentials, { subjectToken: subject, resource: fixture.target.audience })).access_token).toBeTruthy();
  });

  test('should refuse a target the caller holds no grant on', async ({ identity }) => {
    const fixture = await exchangeFixture(identity, 'ungranted');
    const admin = (await identity.admin()).ctx;
    const ungranted = await identity.createOAuthApp('tx-ungranted-target');
    await createResourceScope(admin, ungranted.audience, `${tag()}:read`);

    const user = await identity.createUser({ label: 'tx-ungranted' });
    const subject = await subjectTokenFor(identity, fixture.subjectClient, fixture.caller, user);
    await expectExchangeError(await tokenExchangeGrant(fixture.ctx, fixture.callerCredentials, { subjectToken: subject, resource: ungranted.audience }), 'invalid_target');
    await expectExchangeError(await tokenExchangeGrant(fixture.ctx, fixture.callerCredentials, { subjectToken: subject, resource: `api://${tag()}` }), 'invalid_target');

    expect((await exchangeToken(fixture.ctx, fixture.callerCredentials, { subjectToken: subject, resource: fixture.target.audience })).access_token).toBeTruthy();
  });

  test('should refuse a target the subject user cannot reach while the same caller serves a user who can', async ({ identity }) => {
    const fixture = await exchangeFixture(identity, 'reach');
    const admin = (await identity.admin()).ctx;
    const restricted = await identity.createOAuthApp('tx-restricted', { visibility: 'RESTRICTED' });
    const scope = `${tag()}:read`;
    await grantClientScope(admin, fixture.callerCredentials.clientId, await createResourceScope(admin, restricted.audience, scope));

    const team = await identity.createTeam({ label: 'tx-reach' });
    await releaseApplication(admin, restricted.applicationId, team.organisationId);
    const member = await identity.createUser({ label: 'tx-member' });
    await addOrganisationMember(team.organisationId, member.userId);
    const outsider = await identity.createUser({ label: 'tx-outsider' });

    const outsiderToken = await subjectTokenFor(identity, fixture.subjectClient, fixture.caller, outsider);
    await expectExchangeError(await tokenExchangeGrant(fixture.ctx, fixture.callerCredentials, { subjectToken: outsiderToken, resource: restricted.audience }), 'invalid_target');

    const memberToken = await subjectTokenFor(identity, fixture.subjectClient, fixture.caller, member);
    const allowed = await exchangeToken(fixture.ctx, fixture.callerCredentials, { subjectToken: memberToken, resource: restricted.audience });
    expect(scopesOf(allowed)).toEqual([scope]);
  });

  test('should refuse a service token and a malformed token as the subject', async ({ identity }) => {
    const fixture = await exchangeFixture(identity, 'subject');
    const user = await identity.createUser({ label: 'tx-subject' });
    const subject = await subjectTokenFor(identity, fixture.subjectClient, fixture.caller, user);
    const exchange = (subjectToken: string): Promise<APIResponse> =>
      tokenExchangeGrant(fixture.ctx, fixture.callerCredentials, { subjectToken, resource: fixture.target.audience });

    const service = await serviceToken(fixture.ctx, fixture.callerCredentials);
    expect(decodeJwt(service).payload.token_type).toBe('service');
    await expectExchangeError(await exchange(service), 'invalid_grant');
    await expectExchangeError(await exchange('not-a-jwt'), 'invalid_grant');
    await expectExchangeError(await exchange(`${subject}tampered`), 'invalid_grant');

    expect((await exchangeToken(fixture.ctx, fixture.callerCredentials, { subjectToken: subject, resource: fixture.target.audience })).access_token).toBeTruthy();
  });

  test('should refuse a request missing a required parameter or naming an unsupported token type', async ({ identity }) => {
    const fixture = await exchangeFixture(identity, 'params');
    const user = await identity.createUser({ label: 'tx-params' });
    const subjectToken = await subjectTokenFor(identity, fixture.subjectClient, fixture.caller, user);
    const resource = fixture.target.audience;
    const exchange = (request: Parameters<typeof tokenExchangeGrant>[2]): Promise<APIResponse> => tokenExchangeGrant(fixture.ctx, fixture.callerCredentials, request);

    await expectExchangeError(await exchange({ subjectToken, subjectTokenType: null, resource }), 'invalid_request');
    await expectExchangeError(await exchange({ subjectToken, subjectTokenType: ID_TOKEN_TYPE, resource }), 'invalid_request');
    await expectExchangeError(await exchange({ resource }), 'invalid_request');
    await expectExchangeError(await exchange({ subjectToken, resource, requestedTokenType: ID_TOKEN_TYPE }), 'invalid_request');
    await expectExchangeError(await exchange({ subjectToken, resource, actorToken: subjectToken }), 'invalid_request');
    await expectExchangeError(await exchange({ subjectToken }), 'invalid_target');

    const claims: JwtClaims = verifyJwt((await tokenBody(await exchange({ subjectToken, resource, requestedTokenType: ACCESS_TOKEN_TYPE }))).access_token ?? '', fixture.jwks);
    expect(claims.aud).toBe(resource);
  });
});
