/**
 * Importing npm packages
 */
import { type APIRequestContext } from '@playwright/test';

/**
 * Importing user defined packages
 */
import { findSetCookie, mutate, requireProductUrl } from '../../lib';
import { expect, test } from './fixtures';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Pulse's browser-facing auth surface — the routes `@shadow-library/auth`'s `AuthController` contributes and every
 * pulse-web screen depends on. Driven against the real identity-server rather than a stub: the login redirect is
 * inspected without following it, then the authorize hop and the callback are followed one at a time so each
 * response's status, body and cookies can be asserted on their own.
 */
const SESSION_COOKIE = '__Host-shadow-session';

const LOGIN_STATE_COOKIE = '__Host-shadow-session-login';

/** Follows one hop of the login chain and hands back the `Location` it points at. */
async function hop(ctx: APIRequestContext, url: string): Promise<URL> {
  const response = await ctx.get(url, { maxRedirects: 0 });
  const location = response.headers().location;
  expect(response.status(), `expected a redirect from ${url}, got ${response.status()} ${await response.text()}`).toBe(302);
  expect(location, `no Location on the redirect from ${url}`).toBeTruthy();
  return new URL(location as string, response.url());
}

test.describe('first-party session flow', () => {
  test.beforeEach(() => requireProductUrl('pulse'));

  test('should start the login at identity with PKCE S256, a nonce, pulse as the client and audience, and a login-state cookie', async ({ pulse }) => {
    const guest = await pulse.guest();
    const response = await guest.get('/api/auth/login?return_to=/logs', { maxRedirects: 0 });
    expect(response.status()).toBe(302);

    const authorize = new URL(response.headers().location as string);
    expect(authorize.origin).toBe(requireProductUrl('identity'));
    expect(authorize.pathname).toBe('/oauth2/authorize');
    const query = authorize.searchParams;
    expect(query.get('response_type')).toBe('code');
    expect(query.get('client_id')).toBe('pulse');
    expect(query.get('resource')).toBe('api://pulse');
    expect(query.get('redirect_uri')).toBe(`${requireProductUrl('pulse')}/api/auth/callback`);
    expect(query.get('scope')?.split(' ')).toContain('openid');
    expect(query.get('code_challenge_method')).toBe('S256');
    expect(query.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(query.get('nonce')).toBeTruthy();
    expect(query.get('state')).toBeTruthy();

    const state = findSetCookie(response, LOGIN_STATE_COOKIE);
    expect(state?.value, 'the login state rides in its own cookie').toBeTruthy();
    expect(state?.attributes.has('httponly')).toBe(true);
    expect(state?.attributes.has('secure')).toBe(true);
    expect(state?.attributes.get('path')).toBe('/');
    // The `__Host-` prefix is only honoured by a browser when the cookie names no domain.
    expect(state?.attributes.has('domain')).toBe(false);
  });

  test('should redeem the callback into an app session cookie and redirect to the original return_to', async ({ pulse }) => {
    const staff = await pulse.staff({ label: 'session-callback' });
    const ctx = await pulse.preLogin(staff);

    const authorize = await hop(ctx, '/api/auth/login?return_to=/templates');
    const callback = await hop(ctx, authorize.href);
    expect(callback.pathname).toBe('/api/auth/callback');
    expect(callback.searchParams.get('code'), 'identity should hand the code back to pulse').toBeTruthy();

    const redeemed = await ctx.get(callback.href, { maxRedirects: 0 });
    expect(redeemed.status()).toBe(302);
    expect(redeemed.headers().location).toBe('/templates');
    const session = findSetCookie(redeemed, SESSION_COOKIE);
    expect(session?.value, 'the callback sets the opaque app-session handle').toBeTruthy();
    expect(session?.attributes.has('httponly')).toBe(true);
    expect(session?.attributes.has('secure')).toBe(true);
    expect(findSetCookie(redeemed, LOGIN_STATE_COOKIE)?.attributes.get('max-age'), 'the spent login state is expired').toBe('0');

    const principal = await ctx.get('/api/auth/session');
    expect(principal.status()).toBe(200);
    expect((await principal.json()) as { sub: string }).toMatchObject({ sub: staff.user.sub, clientId: 'pulse' });
  });

  test('should reject a callback with a mismatched or absent login state with 400 LOGIN_STATE_INVALID, then complete a fresh one', async ({ pulse }) => {
    const staff = await pulse.staff({ label: 'session-state' });
    const ctx = await pulse.preLogin(staff);
    const guest = await pulse.guest();

    const authorize = await hop(ctx, '/api/auth/login?return_to=/');
    const callback = await hop(ctx, authorize.href);
    const code = callback.searchParams.get('code') as string;
    const state = callback.searchParams.get('state') as string;

    const mismatched = await ctx.get(`/api/auth/callback?code=${code}&state=${state}-tampered`, { maxRedirects: 0 });
    expect(mismatched.status()).toBe(400);
    expect((await mismatched.json()) as { code?: string }).toMatchObject({ code: 'LOGIN_STATE_INVALID' });

    const stateless = await guest.get(`/api/auth/callback?code=${code}&state=${state}`, { maxRedirects: 0 });
    expect(stateless.status(), 'a callback with no pending login-state cookie is refused whatever it carries').toBe(400);
    expect((await stateless.json()) as { code?: string }).toMatchObject({ code: 'LOGIN_STATE_INVALID' });
    expect(await guest.get('/api/auth/session').then(response => response.status()), 'neither refusal may leave a session behind').toBe(401);

    // The refused code was never redeemed, so the legitimate path is a fresh login on the same account.
    const admitted = await pulse.preLogin(staff);
    const freshAuthorize = await hop(admitted, '/api/auth/login?return_to=/');
    const redeemed = await admitted.get((await hop(admitted, freshAuthorize.href)).href, { maxRedirects: 0 });
    expect(redeemed.status()).toBe(302);
    expect(await admitted.get('/api/auth/session').then(response => response.status())).toBe(200);
  });

  test('should describe the principal for a valid session, refuse no cookie with IAM_001 and a forged handle with SESSION_INVALID', async ({ pulse }) => {
    const staff = await pulse.staff({ label: 'session-principal' });
    const guest = await pulse.guest();

    const described = await staff.ctx.get('/api/auth/session');
    expect(described.status()).toBe(200);
    const principal = (await described.json()) as { sub: string; scopes: string[] };
    expect(principal.sub).toBe(staff.user.sub);
    expect(principal.scopes).toContain('openid');

    const anonymous = await guest.get('/api/auth/session');
    expect(anonymous.status()).toBe(401);
    expect((await anonymous.json()) as { code?: string }).toMatchObject({ code: 'IAM_001' });

    const forged = await guest.get('/api/auth/session', { headers: { cookie: `${SESSION_COOKIE}=e2e-forged-handle-${Date.now()}` } });
    expect(forged.status()).toBe(401);
    expect((await forged.json()) as { code?: string }, 'an unknown handle is a dead session, not a missing credential').toMatchObject({ code: 'SESSION_INVALID' });
  });

  test('should end the app session on logout, clear its cookie and refuse it afterwards', async ({ pulse }) => {
    const staff = await pulse.staff({ label: 'session-logout' });

    const loggedOut = await mutate(staff.ctx, 'post', '/api/auth/logout');
    expect(loggedOut.status()).toBe(200);
    expect((await loggedOut.json()) as { success: boolean }).toMatchObject({ success: true });
    const cleared = findSetCookie(loggedOut, SESSION_COOKIE);
    expect(cleared?.value).toBe('');
    expect(cleared?.attributes.get('max-age')).toBe('0');

    const refused = await staff.ctx.get('/api/auth/session');
    expect(refused.status(), 'the handle the context still holds is no longer a session').toBe(401);

    await staff.ctx.get('/api/auth/login?return_to=/');
    expect(await staff.ctx.get('/api/auth/session').then(response => response.status()), 'logging in again restores the session').toBe(200);
  });
});
