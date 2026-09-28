/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { type APIResponse } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { findSetCookie, readSessionStatus, requireProductUrl } from '../../lib';
import { expect, test } from './fixtures';
import {
  countActiveAppSessions,
  countAppSessions,
  findAppSession,
  followRedirect,
  WEB_NOVEL_CLIENT_ID,
  WEB_NOVEL_LOGIN_STATE_COOKIE,
  WEB_NOVEL_SESSION_COOKIE,
  webNovelMutate,
} from './helpers';

/**
 * Defining types
 */

interface PendingLogin {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

/**
 * Declaring the constants
 *
 * The reader's browser-session surface, which `@shadow-library/auth`'s `AuthController` contributes under `/api/auth`, driven
 * against the real identity-server. Each hop of login → authorize → callback is taken one at a time so every response's
 * status and cookies can be asserted on their own.
 */

const WEB_NOVEL_AUDIENCE = 'api://web-novel';

const WEB_NOVEL_PUBLISH_SCOPE = 'web-novel:publish';

const TOKEN_KEY_PATTERN = /token|jwt|secret|handle/i;

function isScalar(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

function loginPath(returnTo?: string): string {
  return returnTo === undefined ? '/api/auth/login' : `/api/auth/login?${new URLSearchParams({ return_to: returnTo })}`;
}

/** The login-state cookie is deliberately unsealed (`login-state.ts`), so what the callback will compare against is readable. */
function readPendingLogin(response: APIResponse): PendingLogin {
  const cookie = findSetCookie(response, WEB_NOVEL_LOGIN_STATE_COOKIE);
  expect(cookie?.value, 'the login state rides in its own cookie').toBeTruthy();
  return JSON.parse(Buffer.from(decodeURIComponent(cookie?.value ?? ''), 'base64url').toString('utf8')) as PendingLogin;
}

async function errorCode(response: APIResponse): Promise<string | undefined> {
  return ((await response.json()) as { code?: string }).code;
}

test.describe('web-novel session: login', () => {
  test('should start the login at identity with PKCE S256 bound to the pending verifier, web-novel as client and audience, and a login-state cookie', async ({ webNovel }) => {
    const guest = await webNovel.guest();
    const response = await guest.get(loginPath('/library'), { maxRedirects: 0 });
    expect(response.status()).toBe(302);

    const authorize = new URL(response.headers().location as string);
    expect(authorize.origin).toBe(requireProductUrl('identity'));
    expect(authorize.pathname).toBe('/oauth2/authorize');
    const query = authorize.searchParams;
    expect(query.get('response_type')).toBe('code');
    expect(query.get('client_id')).toBe(WEB_NOVEL_CLIENT_ID);
    expect(query.get('resource')).toBe(WEB_NOVEL_AUDIENCE);
    expect(query.get('redirect_uri')).toBe(`${requireProductUrl('webNovel')}/api/auth/callback`);
    expect(query.get('scope')?.split(' ')).toContain('openid');
    expect(query.get('code_challenge_method')).toBe('S256');
    expect(query.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(query.get('nonce')).toBeTruthy();
    expect(query.get('state')).toBeTruthy();

    const pending = readPendingLogin(response);
    expect(pending.state, 'the callback is matched against the state sent out').toBe(query.get('state'));
    expect(pending.nonce).toBe(query.get('nonce'));
    expect(pending.returnTo).toBe('/library');
    const challenge = createHash('sha256').update(pending.codeVerifier).digest('base64url');
    expect(query.get('code_challenge'), 'the challenge is the S256 of the verifier the callback will redeem with').toBe(challenge);

    const state = findSetCookie(response, WEB_NOVEL_LOGIN_STATE_COOKIE);
    expect(state?.attributes.has('httponly')).toBe(true);
    expect(state?.attributes.has('secure')).toBe(true);
    expect(state?.attributes.get('path')).toBe('/');
    // The `__Host-` prefix is only honoured by a browser when the cookie names no domain.
    expect(state?.attributes.has('domain')).toBe(false);
    expect(state?.attributes.get('samesite')?.toLowerCase(), 'the state must survive identity redirecting the browser back').toBe('lax');
    expect(state?.attributes.get('max-age')).toBe('600');
    expect(findSetCookie(response, WEB_NOVEL_SESSION_COOKIE), 'starting a login grants nothing').toBeUndefined();

    const again = new URL((await guest.get(loginPath('/library'), { maxRedirects: 0 })).headers().location as string).searchParams;
    expect(again.get('state'), 'every login gets its own state').not.toBe(query.get('state'));
    expect(again.get('nonce')).not.toBe(query.get('nonce'));
    expect(again.get('code_challenge'), 'every login gets its own verifier').not.toBe(query.get('code_challenge'));
  });

  test('should refuse an off-origin return_to with 400 REDIRECT_NOT_ALLOWED before any login starts', async ({ webNovel }) => {
    const guest = await webNovel.guest();

    for (const returnTo of ['//evil.test/library', '/\\evil.test/library', 'https://evil.test/library', 'javascript:alert(1)']) {
      const response = await guest.get(loginPath(returnTo), { maxRedirects: 0 });
      expect(response.status(), `return_to ${returnTo}`).toBe(400);
      expect(await errorCode(response), `return_to ${returnTo}`).toBe('REDIRECT_NOT_ALLOWED');
      expect(findSetCookie(response, WEB_NOVEL_LOGIN_STATE_COOKIE), `no login may start for return_to ${returnTo}`).toBeUndefined();
    }

    const admitted = await guest.get(loginPath('/library'), { maxRedirects: 0 });
    expect(admitted.status(), 'a same-origin path is still accepted').toBe(302);
    expect(readPendingLogin(admitted).returnTo).toBe('/library');
  });

  test('should refuse a return_to that only reads as off-origin once a browser strips its control characters', async ({ webNovel }) => {
    const guest = await webNovel.guest();

    for (const returnTo of ['/\t/evil.test/library', '/\n/evil.test/library', '/\r/evil.test/library', '/\t\\evil.test/library']) {
      const response = await guest.get(loginPath(returnTo), { maxRedirects: 0 });
      expect(response.status(), `return_to ${JSON.stringify(returnTo)}`).toBe(400);
      expect(await errorCode(response), `return_to ${JSON.stringify(returnTo)}`).toBe('REDIRECT_NOT_ALLOWED');
      expect(findSetCookie(response, WEB_NOVEL_LOGIN_STATE_COOKIE), `no login may start for return_to ${JSON.stringify(returnTo)}`).toBeUndefined();
    }

    const admitted = await guest.get(loginPath('/library/evil.test'), { maxRedirects: 0 });
    expect(admitted.status(), 'a same-origin path that merely names another host is still accepted').toBe(302);
    expect(readPendingLogin(admitted).returnTo).toBe('/library/evil.test');
  });
});

test.describe('web-novel session: callback', () => {
  test('should redeem the code into an app session and redirect to the same-origin return_to, query intact', async ({ webNovel }) => {
    const reader = await webNovel.reader('callback');
    const ctx = await webNovel.preLogin(reader);

    const authorize = await followRedirect(ctx, loginPath('/library?shelf=reading'));
    const callback = await followRedirect(ctx, authorize.href);
    expect(callback.origin + callback.pathname).toBe(`${requireProductUrl('webNovel')}/api/auth/callback`);
    expect(callback.searchParams.get('code'), 'identity hands the code back to web-novel').toBeTruthy();
    expect(callback.searchParams.get('state')).toBe(authorize.searchParams.get('state'));

    const redeemed = await ctx.get(callback.href, { maxRedirects: 0 });
    expect(redeemed.status()).toBe(302);
    expect(redeemed.headers().location).toBe('/library?shelf=reading');
    const session = findSetCookie(redeemed, WEB_NOVEL_SESSION_COOKIE);
    expect(session?.value, 'the callback sets the opaque app-session handle').toBeTruthy();
    expect(session?.attributes.has('httponly')).toBe(true);
    expect(session?.attributes.has('secure')).toBe(true);
    expect(session?.attributes.get('path')).toBe('/');
    expect(session?.attributes.has('domain')).toBe(false);
    expect(findSetCookie(redeemed, WEB_NOVEL_LOGIN_STATE_COOKIE)?.attributes.get('max-age'), 'the spent login state is expired').toBe('0');

    const principal = await ctx.get('/api/auth/session');
    expect(principal.status()).toBe(200);
    expect(await principal.json()).toMatchObject({ sub: reader.user.sub, clientId: WEB_NOVEL_CLIENT_ID });
    expect(await findAppSession(session?.value as string)).toMatchObject({ userId: reader.user.userId, clientId: WEB_NOVEL_CLIENT_ID, status: 'ACTIVE' });
  });

  test('should land on the post-login default when the login named no return_to', async ({ webNovel }) => {
    const reader = await webNovel.reader('callback-default');
    const ctx = await webNovel.preLogin(reader);

    const callback = await followRedirect(ctx, (await followRedirect(ctx, loginPath())).href);
    const redeemed = await ctx.get(callback.href, { maxRedirects: 0 });
    expect(redeemed.status()).toBe(302);
    expect(redeemed.headers().location).toBe('/');
  });

  test('should refuse a mismatched, stateless or code-less callback with 400 LOGIN_STATE_INVALID and still redeem the untouched code', async ({ webNovel }) => {
    const reader = await webNovel.reader('callback-state');
    const ctx = await webNovel.preLogin(reader);
    const guest = await webNovel.guest();

    const authorize = await followRedirect(ctx, loginPath('/library'));
    const callback = await followRedirect(ctx, authorize.href);
    const code = callback.searchParams.get('code') as string;
    const state = callback.searchParams.get('state') as string;

    const refusals: [string, APIResponse][] = [
      ['a tampered state', await ctx.get(`/api/auth/callback?${new URLSearchParams({ code, state: `${state}-tampered` })}`, { maxRedirects: 0 })],
      ['no state', await ctx.get(`/api/auth/callback?${new URLSearchParams({ code })}`, { maxRedirects: 0 })],
      ['no code', await ctx.get(`/api/auth/callback?${new URLSearchParams({ state })}`, { maxRedirects: 0 })],
      ['no login-state cookie', await guest.get(`/api/auth/callback?${new URLSearchParams({ code, state })}`, { maxRedirects: 0 })],
    ];
    for (const [label, response] of refusals) {
      expect(response.status(), label).toBe(400);
      expect(await errorCode(response), label).toBe('LOGIN_STATE_INVALID');
      expect(findSetCookie(response, WEB_NOVEL_SESSION_COOKIE), `${label} must not set a session`).toBeUndefined();
    }
    const unsigned = await ctx.get('/api/auth/session');
    expect(unsigned.status(), 'no refusal may leave a session behind').toBe(401);
    expect(await errorCode(unsigned)).toBe('IAM_001');
    expect(await countActiveAppSessions(reader.user.userId), 'no refusal may reach identity').toBe(0);

    const redeemed = await ctx.get(callback.href, { maxRedirects: 0 });
    expect(redeemed.status(), 'the refused code was never spent, so the legitimate callback still redeems it').toBe(302);
    expect(redeemed.headers().location).toBe('/library');
    expect((await ctx.get('/api/auth/session')).status()).toBe(200);
  });

  test('should mint no second session from a replayed callback, even one carrying the original login state', async ({ webNovel }) => {
    const reader = await webNovel.reader('callback-replay');
    const ctx = await webNovel.preLogin(reader);

    const authorize = await ctx.get(loginPath('/library'), { maxRedirects: 0 });
    const loginState = findSetCookie(authorize, WEB_NOVEL_LOGIN_STATE_COOKIE)?.value as string;
    const callback = await followRedirect(ctx, authorize.headers().location as string);
    expect((await ctx.get(callback.href, { maxRedirects: 0 })).status()).toBe(302);
    expect(await countActiveAppSessions(reader.user.userId)).toBe(1);

    const spent = await ctx.get(callback.href, { maxRedirects: 0 });
    expect(spent.status(), 'the callback cleared the login state it consumed').toBe(400);
    expect(await errorCode(spent)).toBe('LOGIN_STATE_INVALID');

    const attacker = await webNovel.guest();
    const replayed = await attacker.get(callback.href, { maxRedirects: 0, headers: { cookie: `${WEB_NOVEL_LOGIN_STATE_COOKIE}=${loginState}` } });
    expect(replayed.status(), 'identity redeems an authorization code once').not.toBe(302);
    expect(await errorCode(replayed), 'the replay carried a valid login state, so it was identity that refused it').not.toBe('LOGIN_STATE_INVALID');
    expect(findSetCookie(replayed, WEB_NOVEL_SESSION_COOKIE)?.value || undefined, 'a replayed code must not mint a session').toBeUndefined();
    expect(await countAppSessions(reader.user.userId), 'identity minted no second app session from the replayed code').toBe(1);

    const legitimate = await webNovel.signIn(reader);
    expect((await legitimate.ctx.get('/api/auth/session')).status(), 'a fresh login still works').toBe(200);
  });

  test('should answer a replayed authorization code with 400 AUTHORIZATION_CODE_INVALID and mint nothing', async ({ webNovel }) => {
    const reader = await webNovel.reader('callback-replay-status');
    const ctx = await webNovel.preLogin(reader);
    const authorize = await ctx.get(loginPath('/library'), { maxRedirects: 0 });
    const loginState = findSetCookie(authorize, WEB_NOVEL_LOGIN_STATE_COOKIE)?.value as string;
    const callback = await followRedirect(ctx, authorize.headers().location as string);
    expect((await ctx.get(callback.href, { maxRedirects: 0 })).status()).toBe(302);

    const replayed = await (await webNovel.guest()).get(callback.href, { maxRedirects: 0, headers: { cookie: `${WEB_NOVEL_LOGIN_STATE_COOKIE}=${loginState}` } });
    expect(replayed.status(), await replayed.text()).toBe(400);
    expect(await errorCode(replayed)).toBe('AUTHORIZATION_CODE_INVALID');
    expect(await replayed.text(), 'identity’s internal path never reaches the browser').not.toContain('/api/v1/');
    expect(findSetCookie(replayed, WEB_NOVEL_SESSION_COOKIE)?.value || undefined).toBeUndefined();
    expect(await countAppSessions(reader.user.userId)).toBe(1);
  });

  test('should answer a callback identity refused with a client error that echoes none of its text', async ({ webNovel }) => {
    const guest = await webNovel.guest();
    const planted = 'e2e-planted-description';
    const callback = (error: string): Promise<APIResponse> =>
      guest.get(`/api/auth/callback?${new URLSearchParams({ error, error_description: planted, state: 'e2e' })}`, { maxRedirects: 0 });

    const declined = await callback('access_denied');
    expect(declined.status(), await declined.text()).toBe(403);
    expect(await errorCode(declined)).toBe('AUTHORIZATION_DENIED');
    expect(await declined.text()).not.toContain(planted);

    const refused = await callback('invalid_scope');
    expect(refused.status(), await refused.text()).toBe(400);
    expect(await errorCode(refused)).toBe('AUTHORIZATION_REFUSED');
    expect(await refused.text()).not.toContain(planted);

    const reader = await webNovel.reader('callback-refused');
    expect((await (await webNovel.signIn(reader)).ctx.get('/api/auth/session')).status(), 'a real login still completes').toBe(200);
  });
});

test.describe('web-novel session: principal', () => {
  test('should describe a valid session with the flat principal contract and no token', async ({ webNovel }) => {
    const reader = await webNovel.reader('principal');
    const { ctx } = await webNovel.signIn(reader);

    const response = await ctx.get('/api/auth/session');
    expect(response.status()).toBe(200);
    const principal = (await response.json()) as Record<string, unknown>;
    expect(principal).toMatchObject({ sub: reader.user.sub, clientId: WEB_NOVEL_CLIENT_ID, org: reader.user.personalOrgId, aal: 'AAL1' });
    expect(principal.scopes).toEqual(expect.arrayContaining(['openid']));
    expect(principal.scopes, 'the publish scope is service-only, whatever the login asked for').not.toContain(WEB_NOVEL_PUBLISH_SCOPE);
    const keys = Object.keys(principal);
    expect(
      keys.filter(key => TOKEN_KEY_PATTERN.test(key)),
      `the principal never carries a token: ${keys.join(', ')}`,
    ).toEqual([]);
    for (const [key, value] of Object.entries(principal)) {
      const flat = isScalar(value) || (Array.isArray(value) && value.every(isScalar));
      expect(flat, `principal.${key} is a flat value`).toBe(true);
    }
  });

  test('should answer 401 IAM_001 with no session cookie and 401 SESSION_INVALID for an unknown handle, never a 200 with no user', async ({ webNovel }) => {
    const guest = await webNovel.guest();

    const anonymous = await guest.get('/api/auth/session');
    expect(anonymous.status()).toBe(401);
    expect(await errorCode(anonymous)).toBe('IAM_001');

    const forged = await guest.get('/api/auth/session', { headers: { cookie: `${WEB_NOVEL_SESSION_COOKIE}=e2e-forged-${Date.now()}` } });
    expect(forged.status()).toBe(401);
    expect(await errorCode(forged), 'an unknown handle is a dead session, not a missing credential').toBe('SESSION_INVALID');
  });
});

test.describe('web-novel session: logout', () => {
  test('should refuse logout without a matching CSRF token and leave the session live', async ({ webNovel }) => {
    const reader = await webNovel.reader('logout-csrf');
    const { ctx, handle } = await webNovel.signIn(reader);

    const missing = await ctx.post('/api/auth/logout');
    expect(missing.status(), 'the session cookie is present, so the double-submit gate applies').toBe(403);
    expect(await errorCode(missing)).toBe('S010');

    const wrong = await ctx.post('/api/auth/logout', { headers: { 'x-csrf-token': 'e2e-not-the-issued-token' } });
    expect(wrong.status()).toBe(403);
    expect(await errorCode(wrong)).toBe('S010');

    expect((await ctx.get('/api/auth/session')).status(), 'a refused logout ends nothing').toBe(200);
    expect((await findAppSession(handle))?.status).toBe('ACTIVE');

    const admitted = await webNovelMutate(ctx, 'post', '/api/auth/logout');
    expect(admitted.status(), 'the same logout with the issued token goes through').toBe(200);
  });

  test('should revoke exactly the presented app session at identity, clear its cookies and refuse the handle afterwards', async ({ webNovel }) => {
    const reader = await webNovel.reader('logout');
    const leaving = await webNovel.signIn(reader);
    const staying = await webNovel.signIn(reader);
    expect(await countActiveAppSessions(reader.user.userId)).toBe(2);

    const loggedOut = await webNovelMutate(leaving.ctx, 'post', '/api/auth/logout');
    expect(loggedOut.status()).toBe(200);
    expect(await loggedOut.json()).toMatchObject({ success: true });
    const cleared = findSetCookie(loggedOut, WEB_NOVEL_SESSION_COOKIE);
    expect(cleared?.value).toBe('');
    expect(cleared?.attributes.get('max-age')).toBe('0');
    expect(cleared?.attributes.get('path'), 'an expiry only lands on the cookie it names exactly').toBe('/');
    expect(findSetCookie(loggedOut, WEB_NOVEL_LOGIN_STATE_COOKIE)?.attributes.get('max-age')).toBe('0');

    const revoked = await findAppSession(leaving.handle);
    expect(revoked?.status, 'identity revoked the app session').toBe('REVOKED');
    expect(revoked?.terminatedAt).toBeTruthy();
    expect(await countActiveAppSessions(reader.user.userId), 'exactly one session ended').toBe(1);
    expect((await findAppSession(staying.handle))?.status).toBe('ACTIVE');
    expect(await readSessionStatus(reader.session.sessionId), 'an app logout leaves the central identity session alone').toBe('ACTIVE');

    const dropped = await leaving.ctx.get('/api/auth/session');
    expect(dropped.status(), 'the logout expired the cookie, so the context presents no session').toBe(401);
    expect(await errorCode(dropped)).toBe('IAM_001');
    const replay = await (await webNovel.guest()).get('/api/auth/session', { headers: { cookie: `${WEB_NOVEL_SESSION_COOKIE}=${leaving.handle}` } });
    expect(replay.status(), 'a copied handle is refused too').toBe(401);
    expect(await errorCode(replay)).toBe('SESSION_INVALID');
    expect((await staying.ctx.get('/api/auth/session')).status(), 'the reader’s other session survives').toBe(200);

    const again = await webNovel.signIn(reader);
    expect(again.handle, 'signing in again mints a new handle').not.toBe(leaving.handle);
    expect((await again.ctx.get('/api/auth/session')).status()).toBe(200);
  });
});
