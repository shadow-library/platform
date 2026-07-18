/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { TEST_AUDIENCE, TestEnvironment } from '@tests/test-environment';

/**
 * Defining types
 */

interface LoginRedirect {
  authorizeUrl: URL;
  flowCookie: string;
}

/**
 * Declaring the constants
 *
 * Exercises the BINDING first-party session contract pulse-web is coded against:
 * `GET /api/auth/login` -> OIDC redirect, `GET /api/auth/callback` -> cookie session,
 * `GET /api/auth/session` -> flat `{ userId, email?, name? }` | 401, `POST /api/auth/logout`.
 */
const testEnv = new TestEnvironment('auth_session_test');

const USER = { sub: 'user-1', email: 'user-one@example.com', name: 'User One' };

describe('Session', () => {
  testEnv.init();

  const startLogin = async (returnTo?: string): Promise<LoginRedirect> => {
    const path = returnTo ? `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}` : '/api/auth/login';
    const response = await testEnv.getRouter().mockRequest().get(path);

    expect(response.statusCode).toBe(302);
    const location = response.headers.location as string;
    const flowCookie = response.cookies.find(cookie => cookie.name === 'pulse_auth_flow');
    expect(flowCookie).toBeDefined();
    return { authorizeUrl: new URL(location), flowCookie: `pulse_auth_flow=${(flowCookie as { value: string }).value}` };
  };

  /** Runs the full login round-trip and returns the session cookie header */
  const establishSession = async (returnTo = '/'): Promise<string> => {
    const { authorizeUrl, flowCookie } = await startLogin(returnTo);
    const state = authorizeUrl.searchParams.get('state') as string;
    const nonce = authorizeUrl.searchParams.get('nonce') as string;

    const code = testEnv
      .getIdP()
      .createAuthorizationCode({ ...USER, clientId: 'pulse', audience: TEST_AUDIENCE, scopes: ['openid'], claims: { email: USER.email, name: USER.name }, nonce });
    const callback = await testEnv.getRouter().mockRequest().headers({ cookie: flowCookie }).get(`/api/auth/callback?code=${code}&state=${state}`);

    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe(returnTo);
    const sessionCookie = callback.cookies.find(cookie => cookie.name === 'pulse_session');
    expect(sessionCookie).toBeDefined();
    return `pulse_session=${(sessionCookie as { value: string }).value}`;
  };

  describe('GET /api/auth/login', () => {
    it('should redirect to the identity authorization endpoint with PKCE', async () => {
      const { authorizeUrl } = await startLogin('/dashboard');

      expect(authorizeUrl.origin).toBe(new URL(testEnv.getIdP().issuer).origin);
      expect(authorizeUrl.pathname).toBe('/oauth2/authorize');
      expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
      expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
      expect(authorizeUrl.searchParams.get('code_challenge')).toBeTruthy();
      expect(authorizeUrl.searchParams.get('state')).toBeTruthy();
      expect(authorizeUrl.searchParams.get('resource')).toBe(TEST_AUDIENCE);
    });
  });

  describe('GET /api/auth/callback', () => {
    it('should exchange the code, set the session cookie, and redirect to returnTo', async () => {
      const sessionCookie = await establishSession('/dashboard');

      expect(sessionCookie).toStartWith('pulse_session=');
    });

    it('should reject a callback whose state does not match the pending flow', async () => {
      const { flowCookie } = await startLogin();
      const code = testEnv.getIdP().createAuthorizationCode({ sub: USER.sub, audience: TEST_AUDIENCE });
      const response = await testEnv.getRouter().mockRequest().headers({ cookie: flowCookie }).get(`/api/auth/callback?code=${code}&state=tampered`);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'SES_001' });
    });

    it('should reject a callback with no pending login flow cookie', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/auth/callback?code=some-code&state=some-state');

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'SES_001' });
    });
  });

  describe('GET /api/auth/session', () => {
    it('should return the flat session descriptor for a valid session cookie', async () => {
      const sessionCookie = await establishSession();
      const response = await testEnv.getRouter().mockRequest().headers({ cookie: sessionCookie }).get('/api/auth/session');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({ userId: USER.sub, email: USER.email, name: USER.name });
    });

    it('should return 401 when no session cookie is present', async () => {
      const response = await testEnv.getRouter().mockRequest().get('/api/auth/session');

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'SEC_001' });
    });

    it('should return 401 for a tampered session cookie', async () => {
      const response = await testEnv.getRouter().mockRequest().headers({ cookie: 'pulse_session=not-a-token' }).get('/api/auth/session');

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'SEC_001' });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear the session cookie', async () => {
      const sessionCookie = await establishSession();
      const response = await testEnv.getRouter().mockRequest().headers({ cookie: sessionCookie }).post('/api/auth/logout').body({});

      expect(response.statusCode).toBe(204);
      const cleared = response.cookies.find(cookie => cookie.name === 'pulse_session');
      expect(cleared).toMatchObject({ value: '' });
    });
  });
});
