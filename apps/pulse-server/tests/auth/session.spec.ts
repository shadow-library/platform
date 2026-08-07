import { describe, expect, it } from 'bun:test';

import { TEST_AUDIENCE, TEST_GRANTED_SCOPES, TestEnvironment } from '@tests/test-environment';

interface LoginRedirect {
  authorizeUrl: URL;
  stateCookie: string;
}

/**
 * Exercises the first-party session contract pulse-web is coded against, now owned end-to-end by
 * `@shadow-library/auth`'s browser flow (mounted under `/api/auth`): `GET /login` -> OIDC redirect,
 * `GET /callback` -> opaque app-session cookie, `GET /session` -> `{ sub, scopes, ... }` | 401,
 * `POST /logout`. The session cookie holds an opaque handle, never a token; the SDK mints tokens
 * server-to-server from it against the mock IdP's app-session endpoints.
 */
const testEnv = new TestEnvironment('auth_session_test');

const SESSION_COOKIE = '__Host-shadow-session';
const STATE_COOKIE = '__Host-shadow-session-login';

const USER = { sub: 'user-1' };

describe('Session', () => {
  testEnv.init();

  const startLogin = async (returnTo?: string): Promise<LoginRedirect> => {
    const path = returnTo ? `/api/auth/login?return_to=${encodeURIComponent(returnTo)}` : '/api/auth/login';
    const response = await testEnv.getRouter().mockRequest().get(path);

    expect(response.statusCode).toBe(302);
    const stateCookie = response.cookies.find(cookie => cookie.name === STATE_COOKIE);
    expect(stateCookie).toBeDefined();
    return { authorizeUrl: new URL(response.headers.location as string), stateCookie: `${STATE_COOKIE}=${(stateCookie as { value: string }).value}` };
  };

  const establishSession = async (returnTo = '/'): Promise<string> => {
    const { authorizeUrl, stateCookie } = await startLogin(returnTo);
    const state = authorizeUrl.searchParams.get('state') as string;
    const nonce = authorizeUrl.searchParams.get('nonce') as string;

    const code = testEnv.getIdP().createAuthorizationCode({ sub: USER.sub, scopes: [...TEST_GRANTED_SCOPES], nonce });
    const callback = await testEnv.getRouter().mockRequest().headers({ cookie: stateCookie }).get(`/api/auth/callback?code=${code}&state=${state}`);

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe(returnTo);
    const sessionCookie = callback.cookies.find(cookie => cookie.name === SESSION_COOKIE);
    expect(sessionCookie).toBeDefined();
    return `${SESSION_COOKIE}=${(sessionCookie as { value: string }).value}`;
  };

  describe('GET /api/auth/login', () => {
    it('should redirect to the identity authorization endpoint with PKCE and the derived resource', async () => {
      const { authorizeUrl } = await startLogin('/dashboard');

      expect(authorizeUrl.origin).toBe(new URL(testEnv.getIdP().issuer).origin);
      expect(authorizeUrl.pathname).toBe('/oauth2/authorize');
      expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
      expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
      expect(authorizeUrl.searchParams.get('code_challenge')).toBeTruthy();
      expect(authorizeUrl.searchParams.get('state')).toBeTruthy();
      expect(authorizeUrl.searchParams.get('client_id')).toBe('pulse');
      expect(authorizeUrl.searchParams.get('resource')).toBe(TEST_AUDIENCE);
    });
  });

  describe('GET /api/auth/callback', () => {
    it('should redeem the code, set the app-session cookie, and redirect to return_to', async () => {
      const sessionCookie = await establishSession('/dashboard');

      expect(sessionCookie).toStartWith(`${SESSION_COOKIE}=`);
    });

    it('should reject a callback whose state does not match the pending flow', async () => {
      const { stateCookie } = await startLogin();
      const code = testEnv.getIdP().createAuthorizationCode({ sub: USER.sub, scopes: [...TEST_GRANTED_SCOPES] });
      const response = await testEnv.getRouter().mockRequest().headers({ cookie: stateCookie }).get(`/api/auth/callback?code=${code}&state=tampered`);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'LOGIN_STATE_INVALID' });
    });

    it('should reject a callback with no pending login-state cookie', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/auth/callback?code=some-code&state=some-state');

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'LOGIN_STATE_INVALID' });
    });
  });

  describe('GET /api/auth/session', () => {
    it('should return the principal descriptor for a valid session cookie', async () => {
      const sessionCookie = await establishSession();
      const response = await testEnv.getRouter().mockRequest().headers({ cookie: sessionCookie }).get('/api/auth/session');

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.sub).toBe(USER.sub);
      expect([...body.scopes].sort()).toStrictEqual([...TEST_GRANTED_SCOPES].sort());
    });

    it('should return 401 when no session cookie is present', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/auth/session');

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'IAM_001' });
    });

    it('should return 401 for an unknown session handle', async () => {
      const response = await testEnv
        .getRouter()
        .mockRequest()
        .headers({ cookie: `${SESSION_COOKIE}=not-a-real-handle` })
        .get('/api/auth/session');

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'SESSION_INVALID' });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should end the app session and clear the session cookie', async () => {
      const sessionCookie = await establishSession();
      const response = await testEnv.getRouter().mockRequest().headers({ cookie: sessionCookie }).post('/api/auth/logout').body({});

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({ success: true });
      const cleared = response.cookies.find(cookie => cookie.name === SESSION_COOKIE);
      expect(cleared).toMatchObject({ value: '' });
    });
  });
});
