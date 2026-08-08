import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';

import { TestEnvironment } from '@tests/test-environment';
import { AUTH_AUDIENCE, CALLBACK_URI, issueTestToken, TEST_USER, testIdP } from '@tests/test-idp';

interface ResponseWithCookies {
  cookies: { name: string; value: string }[];
}

/**
 * The SDK mounts the browser surface under `/api/auth` and manages the opaque app-session cookie
 * itself (default `__Host-shadow-session`, with the transient login state in `<name>-login`). There
 * is no sealed token and no bearer-promotion middleware — the guard consumes the handle cookie
 * directly, exactly as it would a presented bearer.
 */

const SESSION_COOKIE = '__Host-shadow-session';
const STATE_COOKIE = '__Host-shadow-session-login';

const pgAvailable = await (async () => {
  try {
    const sql = new SQL(process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge');
    await sql`SELECT 1`;
    await sql.close();
    return true;
  } catch {
    return false;
  }
})();

const testEnv = new TestEnvironment('auth_test');

const cookieValue = (response: ResponseWithCookies, name: string): string | undefined => response.cookies.find(cookie => cookie.name === name)?.value;

/** Drives /api/auth/login and redeems the app-session code at the mock IdP, returning the handle cookie */
async function establishSession(options: { returnTo?: string } = {}): Promise<{ session: string; returnTo: string }> {
  const router = testEnv.getRouter({ authenticated: false });
  const query = options.returnTo === undefined ? '' : `?return_to=${encodeURIComponent(options.returnTo)}`;
  const login = await router.mockRequest().get(`/api/auth/login${query}`);
  expect(login.statusCode).toBe(302);

  const authorizeUrl = new URL(login.headers.location as string);
  const state = authorizeUrl.searchParams.get('state') as string;
  const flowCookie = cookieValue(login, STATE_COOKIE) as string;

  const code = testIdP.createAuthorizationCode({ sub: TEST_USER.userId, scopes: ['authz:check'] });
  const callback = await router
    .mockRequest()
    .get(`/api/auth/callback?code=${code}&state=${state}`)
    .cookies({ [STATE_COOKIE]: flowCookie });
  expect(callback.statusCode).toBe(302);
  return { session: cookieValue(callback, SESSION_COOKIE) as string, returnTo: callback.headers.location as string };
}

describe.if(pgAvailable)('authentication', () => {
  testEnv.init();

  describe('bearer guard on the API surface', () => {
    it('should reject requests without a token with 401', async () => {
      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/v1/projects');
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('IAM_001');
    });

    it('should reject garbage and wrong-audience tokens with 401', async () => {
      const router = testEnv.getRouter({ authenticated: false });
      const garbage = await router.mockRequest().get('/api/v1/projects').headers({ authorization: 'Bearer garbage' });
      expect(garbage.statusCode).toBe(401);

      const foreign = await testIdP.issueToken({ sub: TEST_USER.userId, audience: 'api://other' });
      const wrongAudience = await router
        .mockRequest()
        .get('/api/v1/projects')
        .headers({ authorization: `Bearer ${foreign}` });
      expect(wrongAudience.statusCode).toBe(401);
    });

    it('should accept a valid identity user token', async () => {
      const token = await issueTestToken();
      const response = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .get('/api/v1/projects')
        .headers({ authorization: `Bearer ${token}` });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /api/auth/login', () => {
    it('should redirect to the identity authorize endpoint with PKCE and set the login-state cookie', async () => {
      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/auth/login');
      expect(response.statusCode).toBe(302);

      const url = new URL(response.headers.location as string);
      expect(url.origin).toBe(testIdP.issuer);
      expect(url.pathname).toBe('/oauth2/authorize');
      expect(url.searchParams.get('client_id')).toBe('novel-forge');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('redirect_uri')).toBe(CALLBACK_URI);
      // resource is the derived audience, so identity mints a token this server's own guard accepts.
      expect(url.searchParams.get('resource')).toBe(AUTH_AUDIENCE);
      expect(cookieValue(response, STATE_COOKIE)).toBeString();
    });

    it('should reject an absolute return_to that is not in the allow-list', async () => {
      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/auth/login?return_to=https%3A%2F%2Fevil.example');
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('REDIRECT_NOT_ALLOWED');
    });

    it('should reject a backslash return_to that browsers resolve off-origin', async () => {
      // `/\evil.com` starts with a slash but a browser folds the backslash into `//`, redirecting off-origin.
      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/auth/login?return_to=%2F%5Cevil.com');
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('REDIRECT_NOT_ALLOWED');
    });
  });

  describe('GET /api/auth/callback', () => {
    it('should reject a callback without the login-state cookie', async () => {
      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/auth/callback?code=abc&state=xyz');
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('LOGIN_STATE_INVALID');
    });

    it('should reject a state mismatch', async () => {
      const router = testEnv.getRouter({ authenticated: false });
      const login = await router.mockRequest().get('/api/auth/login');
      const flowCookie = cookieValue(login, STATE_COOKIE) as string;
      const response = await router
        .mockRequest()
        .get('/api/auth/callback?code=abc&state=tampered')
        .cookies({ [STATE_COOKIE]: flowCookie });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('LOGIN_STATE_INVALID');
    });

    it('should complete the code flow and redirect to the requested return_to', async () => {
      const { session, returnTo } = await establishSession({ returnTo: '/projects/7' });
      expect(returnTo).toBe('/projects/7');
      expect(session).toBeString();
    });
  });

  describe('GET /api/auth/session', () => {
    it('should answer 401 (never a 200 null) when unauthenticated', async () => {
      const bare = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/auth/session');
      expect(bare.statusCode).toBe(401);
      expect(bare.json().code).toBe('IAM_001');

      const garbage = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .get('/api/auth/session')
        .cookies({ [SESSION_COOKIE]: 'garbage' });
      expect(garbage.statusCode).toBe(401);
    });

    it('should return the SDK principal shape for an established session', async () => {
      const { session } = await establishSession();
      const response = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .get('/api/auth/session')
        .cookies({ [SESSION_COOKIE]: session });
      expect(response.statusCode).toBe(200);
      // The 0.4 surface reports the verified principal — `sub`, not a `{ userId, email, name }` profile.
      expect(response.json()).toMatchObject({ sub: TEST_USER.userId, scopes: ['authz:check'] });
    });

    it('should reject a session after identity ends the central session', async () => {
      const { session } = await establishSession();
      testIdP.endIdentitySession(TEST_USER.userId);
      const response = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .get('/api/auth/session')
        .cookies({ [SESSION_COOKIE]: session });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('session cookie on the API surface', () => {
    it('should authenticate API routes through the session cookie alone', async () => {
      const { session } = await establishSession();
      const response = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .get('/api/v1/projects')
        .cookies({ [SESSION_COOKIE]: session });
      expect(response.statusCode).toBe(200);
    });

    it('should let a presented bearer take precedence, so a bad one is not rescued by the cookie', async () => {
      const { session } = await establishSession();
      const response = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .get('/api/v1/projects')
        .headers({ authorization: 'Bearer garbage' })
        .cookies({ [SESSION_COOKIE]: session });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear the session cookie', async () => {
      const { session } = await establishSession();
      const response = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .post('/api/auth/logout')
        .cookies({ [SESSION_COOKIE]: session });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ success: true });
      expect(cookieValue(response, SESSION_COOKIE)).toBe('');
    });
  });
});
