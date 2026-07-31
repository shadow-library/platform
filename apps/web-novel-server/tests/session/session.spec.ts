/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { csrfPair, TestEnvironment } from '../test-environment';
import { AUDIENCE, idp, LOGIN_COOKIE_NAME, LOGIN_SCOPES, SESSION_COOKIE_NAME, WEBNOVEL_CLIENT_ID } from '../test-idp';

/**
 * Defining types
 */

interface LoginResult {
  sessionCookie: string;
  redirectedTo: string;
}

/**
 * Declaring the constants
 *
 * The reader login surface is now owned entirely by `@shadow-library/auth`'s `AuthModule`, mounted at
 * `/api/auth`. The dance is first-party (D-18): the callback redeems the authorization code for an
 * opaque app-session handle held in the `__Host-shadow-session` cookie, and `GET /api/auth/session`
 * resolves that handle into the flat principal `{ sub, scopes, ... }`.
 */
const env = new TestEnvironment('session').init();

/** Drives the full first-party dance against the mock IdP: login redirect → authorization code → callback */
async function loginAs(sub: string, options: { returnTo?: string } = {}): Promise<LoginResult> {
  const returnTo = options.returnTo ?? '/browse';
  const loginResponse = await env
    .getRouter()
    .mockRequest()
    .get(`/api/auth/login?return_to=${encodeURIComponent(returnTo)}`);
  expect(loginResponse.statusCode).toBe(302);

  const location = new URL(loginResponse.headers.location as string);
  const state = location.searchParams.get('state') as string;
  const loginCookie = loginResponse.cookies.find(cookie => cookie.name === LOGIN_COOKIE_NAME) as { value: string } | undefined;
  expect(loginCookie).toBeDefined();

  const code = idp.createAuthorizationCode({ sub, scopes: LOGIN_SCOPES });
  const callback = await env
    .getRouter()
    .mockRequest()
    .get(`/api/auth/callback?code=${code}&state=${state}`)
    .cookies({ [LOGIN_COOKIE_NAME]: (loginCookie as { value: string }).value });
  expect(callback.statusCode).toBe(302);

  const sessionCookie = callback.cookies.find(cookie => cookie.name === SESSION_COOKIE_NAME) as { value: string } | undefined;
  expect(sessionCookie).toBeDefined();
  return { sessionCookie: (sessionCookie as { value: string }).value, redirectedTo: callback.headers.location as string };
}

describe('Reader session surface', () => {
  describe('GET /api/auth/login', () => {
    it('should redirect to the identity authorize endpoint with PKCE and set the login-state cookie', async () => {
      const response = await env.getRouter().mockRequest().get('/api/auth/login?return_to=/browse');
      expect(response.statusCode).toBe(302);

      const location = new URL(response.headers.location as string);
      expect(location.origin).toBe(idp.issuer);
      expect(location.pathname).toBe('/oauth2/authorize');
      expect(location.searchParams.get('client_id')).toBe(WEBNOVEL_CLIENT_ID);
      expect(location.searchParams.get('response_type')).toBe('code');
      expect(location.searchParams.get('code_challenge_method')).toBe('S256');
      expect(location.searchParams.get('resource')).toBe(AUDIENCE);
      expect(response.cookies.find(cookie => cookie.name === LOGIN_COOKIE_NAME)).toBeDefined();
    });
  });

  describe('GET /api/auth/callback', () => {
    it('should redeem the code, set the app-session cookie, and redirect to the sanitized return_to', async () => {
      const login = await loginAs('reader-1');
      expect(login.redirectedTo).toBe('/browse');
      expect(login.sessionCookie.length).toBeGreaterThan(16);
    });

    it('should preserve a same-origin absolute return_to', async () => {
      const login = await loginAs('reader-1', { returnTo: '/library' });
      expect(login.redirectedTo).toBe('/library');
    });

    it('should reject a callback whose state does not match the login state', async () => {
      const loginResponse = await env.getRouter().mockRequest().get('/api/auth/login');
      const loginCookie = loginResponse.cookies.find(cookie => cookie.name === LOGIN_COOKIE_NAME) as { value: string };
      const code = idp.createAuthorizationCode({ sub: 'reader-1', scopes: LOGIN_SCOPES });

      const response = await env
        .getRouter()
        .mockRequest()
        .get(`/api/auth/callback?code=${code}&state=forged-state`)
        .cookies({ [LOGIN_COOKIE_NAME]: loginCookie.value });
      expect(response.statusCode).toBe(400);
    });

    it('should reject a callback without a login-state cookie', async () => {
      const response = await env.getRouter().mockRequest().get('/api/auth/callback?code=whatever&state=whatever');
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /api/auth/session', () => {
    it('should answer the flat principal contract with a valid session cookie', async () => {
      const login = await loginAs('reader-1');
      const response = await env
        .getRouter()
        .mockRequest()
        .get('/api/auth/session')
        .cookies({ [SESSION_COOKIE_NAME]: login.sessionCookie });
      expect(response.statusCode).toBe(200);

      const body = response.json() as { sub: string; scopes: string[] };
      expect(body.sub).toBe('reader-1');
      expect(body.scopes).toEqual(expect.arrayContaining(LOGIN_SCOPES));
    });

    it('should answer 401 without a session cookie, never a 200 with a null user', async () => {
      const response = await env.getRouter().mockRequest().get('/api/auth/session');
      expect(response.statusCode).toBe(401);
    });

    it('should answer 401 for an unknown session handle', async () => {
      const response = await env
        .getRouter()
        .mockRequest()
        .get('/api/auth/session')
        .cookies({ [SESSION_COOKIE_NAME]: 'not-a-real-handle' });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should revoke the session, clear the cookie, and satisfy the CSRF double-submit gate', async () => {
      const login = await loginAs('reader-1');
      const before = idp.getAppSessionCount();
      const csrf = csrfPair();
      const response = await env
        .getRouter()
        .mockRequest()
        .post('/api/auth/logout')
        .headers({ 'x-csrf-token': csrf.header })
        .cookies({ [SESSION_COOKIE_NAME]: login.sessionCookie, 'csrf-token': csrf.cookie });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ success: true });

      const cleared = response.cookies.find(cookie => cookie.name === SESSION_COOKIE_NAME) as { value: string } | undefined;
      expect(cleared).toBeDefined();
      expect(cleared?.value).toBe('');
      expect(idp.getAppSessionCount()).toBe(before - 1);
    });

    it('should be rejected by the CSRF gate when a cookie is present but the token is missing', async () => {
      const login = await loginAs('reader-1');
      const response = await env
        .getRouter()
        .mockRequest()
        .post('/api/auth/logout')
        .cookies({ [SESSION_COOKIE_NAME]: login.sessionCookie });
      expect(response.statusCode).toBe(403);
    });
  });
});
