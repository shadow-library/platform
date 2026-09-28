/**
 * Importing npm packages
 */
import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { addOrganisationMember, assignApplicationRole, findApplicationRoleId, findSetCookie, identityMutate, mutate, pollUntil, requireProductUrl } from '../../lib';
import { expect, test, untilIdentityAdmits } from './forge-actors';
import { expectCode } from './forge-arrange';

/**
 * Defining types
 */

interface SessionBody {
  readonly sub: string;
  readonly scopes: string[];
  readonly org?: string;
  readonly aal: string;
}

/**
 * Declaring the constants
 *
 * How a caller becomes someone to Novel Forge, and stops being one: the `/access` admin probe, the bearer and cookie paths the auth guard
 * accepts, the login and callback legs of the OIDC hop, logout, and what happens to an app session once identity ends the central one.
 */

const SESSION_COOKIE = '__Host-shadow-session';

const LOGIN_STATE_COOKIE = `${SESSION_COOKIE}-login`;

/** A token shaped like a signed JWT that no issuer signed. */
const FORGED_JWT = `${Buffer.from('{"alg":"RS256","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"sub":"1","aud":"api://novel-forge"}').toString('base64url')}.c2lnbmF0dXJl`;

function location(response: APIResponse): URL {
  const header = response.headers()['location'];
  expect(header, `a redirect carries a Location (status ${response.status()})`).toBeTruthy();
  return new URL(header as string, response.url());
}

test.describe('novel-forge access probe', () => {
  test('should report admin only to a person holding novel-forge:admin where their session acts', async ({ forge }) => {
    const admin = await forge.actor({ label: 'access-admin', roles: ['NovelForgeAdmin'] });
    const author = await forge.actor({ label: 'access-author' });

    const granted = await pollUntil(
      async () => (await admin.ctx.get('/api/v1/access')).json() as Promise<{ admin?: boolean }>,
      body => body.admin === true,
      { timeoutMs: 70_000, intervalMs: 5_000 },
    );
    expect(granted, 'a throttled policy decision fails closed, so an admin is retried into the next window').toEqual({ admin: true });

    const plain = await author.ctx.get('/api/v1/access');
    expect(plain.status(), await plain.text()).toBe(200);
    expect(await plain.json()).toEqual({ admin: false });
  });

  test('should not count an admin role held in another organisation than the one the session acts in', async ({ forge }) => {
    const team = await forge.team('access-elsewhere');
    const author = await forge.actor({ label: 'access-elsewhere' });
    await addOrganisationMember(team.organisationId, author.user.userId);
    await assignApplicationRole({ type: 'USER', id: author.user.userId }, await findApplicationRoleId('novel-forge', 'NovelForgeAdmin'), team.organisationId);

    const probe = await author.ctx.get('/api/v1/access');
    expect(probe.status(), await probe.text()).toBe(200);
    expect(await probe.json(), 'the session acts in the personal organisation, where no admin role is held').toEqual({ admin: false });

    const switched = await untilIdentityAdmits(() => mutate(author.ctx, 'post', '/api/auth/organisation', { data: { organisationId: team.organisationId } }));
    expect(switched.status(), await switched.text()).toBe(200);
    const granted = await pollUntil(
      async () => (await author.ctx.get('/api/v1/access')).json() as Promise<{ admin?: boolean }>,
      body => body.admin === true,
      { timeoutMs: 70_000, intervalMs: 5_000 },
    );
    expect(granted, 'acting in the team, the same role makes the person an admin').toEqual({ admin: true });

    const back = await untilIdentityAdmits(() => mutate(author.ctx, 'post', '/api/auth/organisation', { data: { organisationId: author.user.personalOrgId } }));
    expect(back.status(), await back.text()).toBe(200);
    const personal = await author.ctx.get('/api/v1/access');
    expect(personal.status(), await personal.text()).toBe(200);
    expect(await personal.json(), 'back in the personal organisation, the team role counts for nothing again').toEqual({ admin: false });
  });

  test('should refuse a bot and an anonymous caller on the access probe', async ({ forge }) => {
    const team = await forge.team('access');
    const bot = await forge.bot(team, ['projects:write', 'generation', 'illustrations'], 'access');

    await expectCode(await bot.ctx.get('/api/v1/access'), 403, 'IAM_002', 'a bot is refused the admin probe whatever it holds');
    await expectCode(await (await forge.anonymous()).get('/api/v1/access'), 401, 'IAM_001', 'an anonymous caller must authenticate first');

    const own = await bot.ctx.get('/api/v1/projects');
    expect(own.status(), `the same key still reaches a route open to bots — body ${await own.text()}`).toBe(200);
  });
});

test.describe('novel-forge credentials', () => {
  test('should refuse a missing, garbage or forged bearer and never let a cookie rescue a bad one', async ({ forge }) => {
    const author = await forge.actor({ label: 'bearer' });
    const anonymous = await forge.anonymous();

    await expectCode(await anonymous.get('/api/v1/projects'), 401, 'IAM_001', 'no credential at all');
    await expectCode(await anonymous.get('/api/v1/projects', { headers: { authorization: 'Bearer not-a-token' } }), 401, 'IAM_001', 'a garbage bearer');
    await expectCode(await anonymous.get('/api/v1/projects', { headers: { authorization: `Bearer ${FORGED_JWT}` } }), 401, 'IAM_001', 'an unsigned JWT-shaped bearer');
    await expectCode(
      await author.ctx.get('/api/v1/projects', { headers: { authorization: `Bearer ${FORGED_JWT}` } }),
      401,
      'IAM_001',
      'a bad bearer beside a valid session cookie — the bearer wins',
    );

    const cookie = await author.ctx.get('/api/v1/projects');
    expect(cookie.status(), `the session cookie alone authenticates — body ${await cookie.text()}`).toBe(200);
  });

  test('should admit a bot presenting its key as a bearer', async ({ forge }) => {
    const team = await forge.team('bearer-bot');
    const bot = await forge.bot(team, ['projects:read'], 'bearer');

    const listed = await bot.ctx.get('/api/v1/projects');
    expect(listed.status(), await listed.text()).toBe(200);
    expect(((await listed.json()) as { items: unknown[] }).items).toEqual([]);
  });

  test('should answer the session probe 401 when signed out and with the verified principal when signed in', async ({ forge }) => {
    const author = await forge.actor({ label: 'session-shape' });

    await expectCode(await (await forge.anonymous()).get('/api/auth/session'), 401, 'IAM_001', 'no session is a 401, never a 200 with nothing in it');

    const signedIn = await author.ctx.get('/api/auth/session');
    expect(signedIn.status(), await signedIn.text()).toBe(200);
    const body = (await signedIn.json()) as SessionBody;
    expect(body.sub, 'the principal is the identity user').toBe(author.user.sub);
    expect(body.org, 'a fresh user acts in their personal organisation').toBe(author.user.personalOrgId);
    expect(body.aal).toBe('AAL1');
    expect(Array.isArray(body.scopes)).toBe(true);
  });
});

test.describe('novel-forge login and callback', () => {
  test('should start the login with PKCE S256 towards identity and a login-state cookie', async ({ forge }) => {
    const forgeUrl = requireProductUrl('novelForge');
    const response = await (await forge.anonymous()).get('/api/auth/login?return_to=/novels', { maxRedirects: 0 });
    expect(response.status(), await response.text()).toBe(302);

    const target = location(response);
    expect(target.origin, 'the login is handed to identity').toBe(new URL(requireProductUrl('identity')).origin);
    expect(target.pathname).toMatch(/authorize$/);
    expect(target.searchParams.get('response_type')).toBe('code');
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    expect(target.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(target.searchParams.get('client_id')).toBe('novel-forge');
    expect(target.searchParams.get('redirect_uri')).toBe(`${forgeUrl}/api/auth/callback`);
    expect(target.searchParams.get('resource')).toBe('api://novel-forge');
    expect(target.searchParams.get('state')).toBeTruthy();
    expect(target.searchParams.get('nonce')).toBeTruthy();

    const state = findSetCookie(response, LOGIN_STATE_COOKIE);
    expect(state, 'the in-flight login is kept in its own cookie').toBeDefined();
    expect(state?.attributes.has('httponly')).toBe(true);
  });

  test('should refuse a return_to that leaves Novel Forge, however it is spelled', async ({ forge }) => {
    const anonymous = await forge.anonymous();
    for (const returnTo of ['https://evil.test/landing', '//evil.test/landing', '/\\evil.test/landing']) {
      const response = await anonymous.get(`/api/auth/login?return_to=${encodeURIComponent(returnTo)}`, { maxRedirects: 0 });
      await expectCode(response, 400, 'REDIRECT_NOT_ALLOWED', `return_to=${returnTo}`);
    }

    const local = await anonymous.get(`/api/auth/login?return_to=${encodeURIComponent('/novels')}`, { maxRedirects: 0 });
    expect(local.status(), 'a same-origin path is accepted').toBe(302);
  });

  test('should refuse a callback with no login state or a state that does not match', async ({ forge }) => {
    const stranger = await forge.anonymous();
    await expectCode(await stranger.get('/api/auth/callback?code=e2e-code&state=e2e-state', { maxRedirects: 0 }), 400, 'LOGIN_STATE_INVALID', 'no login-state cookie');

    const started = await forge.anonymous();
    const login = await started.get('/api/auth/login?return_to=/novels', { maxRedirects: 0 });
    expect(login.status()).toBe(302);
    const mismatched = await started.get('/api/auth/callback?code=e2e-code&state=not-the-state-that-was-issued', { maxRedirects: 0 });
    await expectCode(mismatched, 400, 'LOGIN_STATE_INVALID', 'a state that is not the one this browser was issued');
  });

  test('should complete a real hop onto the requested return_to with a fresh session cookie', async ({ forge }) => {
    const forgeUrl = requireProductUrl('novelForge');
    const author = await forge.actor({ label: 'hop' });
    const browserish = await forge.identity(author);
    const returnTo = '/novels/e2e-landing';

    const callback = await untilIdentityAdmits(async () => {
      const login = await browserish.get(`${forgeUrl}/api/auth/login?return_to=${encodeURIComponent(returnTo)}`, { maxRedirects: 0 });
      expect(login.status()).toBe(302);
      const authorize = await browserish.get(location(login).toString(), { maxRedirects: 0 });
      expect(authorize.status(), `identity answers the authorize leg with a redirect — body ${await authorize.text()}`).toBe(302);
      const callbackUrl = location(authorize);
      expect(`${callbackUrl.origin}${callbackUrl.pathname}`).toBe(`${forgeUrl}/api/auth/callback`);
      return browserish.get(callbackUrl.toString(), { maxRedirects: 0 });
    });
    expect(callback.status(), await callback.text()).toBe(302);
    expect(location(callback).pathname, 'the hop lands where the login was asked to return').toBe(returnTo);
    expect(findSetCookie(callback, SESSION_COOKIE)?.value, 'the callback sets the app session').toBeTruthy();

    const session = await browserish.get(`${forgeUrl}/api/auth/session`);
    expect(session.status(), await session.text()).toBe(200);
    expect(((await session.json()) as SessionBody).sub).toBe(author.user.sub);
  });
});

test.describe('novel-forge logout', () => {
  test('should refuse a logout without the CSRF token and end the session with it', async ({ forge }) => {
    const author = await forge.actor({ label: 'logout' });

    const refused = await author.ctx.post('/api/auth/logout');
    await expectCode(refused, 403, 'S010', 'a cookie-bearing logout with no double-submit token');
    expect((await author.ctx.get('/api/auth/session')).status(), 'the refused logout ended nothing').toBe(200);

    const loggedOut = await untilIdentityAdmits(() => mutate(author.ctx, 'post', '/api/auth/logout'));
    expect(loggedOut.status(), await loggedOut.text()).toBe(200);
    expect(((await loggedOut.json()) as { success: boolean }).success).toBe(true);
    const cleared = findSetCookie(loggedOut, SESSION_COOKIE);
    expect(cleared, 'the session cookie is cleared').toBeDefined();
    expect(cleared?.value ?? 'x').toBe('');

    await expectCode(await author.ctx.get('/api/auth/session'), 401, 'IAM_001', 'the logged-out session is gone');
  });
});

test.describe('novel-forge session after an identity signout', () => {
  test('should reject the app session once identity ends the central session', async ({ forge }) => {
    const author = await forge.actor({ label: 'signout', accessTokenTtlSeconds: 60 });
    const before = await untilIdentityAdmits(() => author.ctx.get('/api/auth/session'));
    expect(before.status(), `signed in before the signout — ${await before.text()}`).toBe(200);

    const signout = await identityMutate(await forge.identity(author), 'post', '/api/v1/auth/signout');
    expect(signout.status(), `identity signout — body ${await signout.text()}`).toBe(204);

    const status = await pollUntil(
      async () => (await author.ctx.get('/api/v1/projects')).status(),
      value => value === 401,
      { timeoutMs: 75_000, intervalMs: 2_000 },
    );
    expect(status, 'the next token mint after the signout must fail the app session').toBe(401);
    await expectCode(await author.ctx.get('/api/auth/session'), 401, 'IAM_001', 'the session probe agrees');
  });
});
