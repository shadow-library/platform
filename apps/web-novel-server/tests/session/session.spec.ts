/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE_NAME } from '@server/modules/session';

import { csrfPair, TestEnvironment } from '../test-environment';
import { idp, RP_CLIENT_ID } from '../test-idp';

/**
 * Defining types
 */

interface LoginResult {
  sessionCookie: string;
  redirectedTo: string;
}

/**
 * Declaring the constants
 */
const env = new TestEnvironment('session').init();

/** Drives the full OIDC dance against the mock IdP: login redirect → authorization code → callback */
async function loginAs(sub: string, options: { returnTo?: string; claims?: Record<string, unknown> } = {}): Promise<LoginResult> {
  const returnTo = options.returnTo ?? '/browse';
  const loginResponse = await env
    .getRouter()
    .mockRequest()
    .get(`/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  expect(loginResponse.statusCode).toBe(302);

  const location = new URL(loginResponse.headers.location as string);
  const state = location.searchParams.get('state') as string;
  const nonce = location.searchParams.get('nonce') as string;
  const loginCookie = loginResponse.cookies.find(cookie => cookie.name === 'wn_login');
  expect(loginCookie).toBeDefined();

  const code = idp.createAuthorizationCode({ sub, clientId: RP_CLIENT_ID, nonce, claims: { email: 'reader@example.com', name: 'Reader One', ...options.claims } });
  const callback = await env
    .getRouter()
    .mockRequest()
    .get(`/api/auth/callback?code=${code}&state=${state}`)
    .cookies({ wn_login: (loginCookie as { value: string }).value });
  expect(callback.statusCode).toBe(302);

  const sessionCookie = callback.cookies.find(cookie => cookie.name === SESSION_COOKIE_NAME);
  expect(sessionCookie).toBeDefined();
  return { sessionCookie: (sessionCookie as { value: string }).value, redirectedTo: callback.headers.location as string };
}

describe('Reader session surface', () => {
  describe('GET /api/auth/login', () => {
    it('should redirect to the identity authorize endpoint with PKCE and set the login-transaction cookie', async () => {
      const response = await env.getRouter().mockRequest().get('/api/auth/login?returnTo=/browse');
      expect(response.statusCode).toBe(302);

      const location = new URL(response.headers.location as string);
      expect(location.origin).toBe(idp.issuer);
      expect(location.pathname).toBe('/oauth2/authorize');
      expect(location.searchParams.get('client_id')).toBe(RP_CLIENT_ID);
      expect(location.searchParams.get('response_type')).toBe('code');
      expect(location.searchParams.get('code_challenge_method')).toBe('S256');
      expect(response.cookies.find(cookie => cookie.name === 'wn_login')).toBeDefined();
    });
  });

  describe('GET /api/auth/callback', () => {
    it('should exchange the code, mint the session cookie, and redirect to the sanitized returnTo', async () => {
      const login = await loginAs('reader-1');
      expect(login.redirectedTo).toBe('/browse');
      expect(login.sessionCookie.length).toBeGreaterThan(16);
    });

    it('should fall back to the root for an off-origin returnTo', async () => {
      const login = await loginAs('reader-1', { returnTo: 'https://evil.example.com/phish' });
      expect(login.redirectedTo).toBe('/');
    });

    it('should fall back to the root for a backslash-obfuscated returnTo', async () => {
      const escaped = await loginAs('reader-1', { returnTo: '/\\evil.com' });
      expect(escaped.redirectedTo).toBe('/');

      const doubled = await loginAs('reader-1', { returnTo: '/\\/evil.com' });
      expect(doubled.redirectedTo).toBe('/');
    });

    it('should preserve a same-origin absolute returnTo', async () => {
      const login = await loginAs('reader-1', { returnTo: '/library' });
      expect(login.redirectedTo).toBe('/library');
    });

    it('should reject a callback whose state does not match the transaction', async () => {
      const loginResponse = await env.getRouter().mockRequest().get('/api/auth/login');
      const location = new URL(loginResponse.headers.location as string);
      const nonce = location.searchParams.get('nonce') as string;
      const loginCookie = loginResponse.cookies.find(cookie => cookie.name === 'wn_login') as { value: string };

      const code = idp.createAuthorizationCode({ sub: 'reader-1', clientId: RP_CLIENT_ID, nonce });
      const response = await env.getRouter().mockRequest().get(`/api/auth/callback?code=${code}&state=forged-state`).cookies({ wn_login: loginCookie.value });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'WBN_005' });
    });

    it('should reject a callback without a login-transaction cookie', async () => {
      const response = await env.getRouter().mockRequest().get('/api/auth/callback?code=whatever&state=whatever');
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'WBN_005' });
    });
  });

  describe('GET /api/auth/session', () => {
    it('should answer the flat session contract with a valid session cookie', async () => {
      const login = await loginAs('reader-1');
      const response = await env
        .getRouter()
        .mockRequest()
        .get('/api/auth/session')
        .cookies({ [SESSION_COOKIE_NAME]: login.sessionCookie });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ userId: 'reader-1', email: 'reader@example.com', name: 'Reader One' });
    });

    it('should answer 401 without a session cookie, never a 200 with a null user', async () => {
      const response = await env.getRouter().mockRequest().get('/api/auth/session');
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'WBN_004' });
    });

    it('should answer 401 for a tampered session cookie', async () => {
      const login = await loginAs('reader-1');
      const tampered = login.sessionCookie.slice(0, -2) + (login.sessionCookie.endsWith('aa') ? 'bb' : 'aa');
      const response = await env
        .getRouter()
        .mockRequest()
        .get('/api/auth/session')
        .cookies({ [SESSION_COOKIE_NAME]: tampered });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear the session cookie', async () => {
      const login = await loginAs('reader-1');
      const csrf = csrfPair();
      const response = await env
        .getRouter()
        .mockRequest()
        .post('/api/auth/logout')
        .headers({ 'x-csrf-token': csrf.header })
        .cookies({ [SESSION_COOKIE_NAME]: login.sessionCookie, 'csrf-token': csrf.cookie });
      expect(response.statusCode).toBe(204);

      const cleared = response.cookies.find(cookie => cookie.name === SESSION_COOKIE_NAME) as { value: string; expires?: Date } | undefined;
      expect(cleared).toBeDefined();
      expect(cleared?.value).toBe('');
    });
  });
});
