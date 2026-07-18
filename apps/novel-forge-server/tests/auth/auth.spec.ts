/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { SQL } from 'bun';
import { describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { TestEnvironment } from '@tests/test-environment';
import { AUTH_AUDIENCE, issueTestToken, TEST_USER, testIdP } from '@tests/test-idp';

/**
 * Defining types
 */

interface ResponseWithCookies {
  cookies: { name: string; value: string }[];
}

/**
 * Declaring the constants
 */

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

/** Drives /api/auth/login and redeems the state/nonce at the mock IdP, returning the session cookie */
async function establishSession(options: { returnTo?: string; ttlSeconds?: number } = {}): Promise<{ session: string; returnTo: string }> {
  const router = testEnv.getRouter({ authenticated: false });
  const query = options.returnTo === undefined ? '' : `?returnTo=${encodeURIComponent(options.returnTo)}`;
  const login = await router.mockRequest().get(`/api/auth/login${query}`);
  expect(login.statusCode).toBe(302);

  const authorizeUrl = new URL(login.headers.location as string);
  const state = authorizeUrl.searchParams.get('state') as string;
  const nonce = authorizeUrl.searchParams.get('nonce') as string;
  const flowCookie = cookieValue(login, 'nf-oidc') as string;

  const code = testIdP.createAuthorizationCode({
    sub: TEST_USER.userId,
    audience: AUTH_AUDIENCE,
    nonce,
    ttlSeconds: options.ttlSeconds,
    claims: { email: TEST_USER.email, name: TEST_USER.name },
  });
  const callback = await router.mockRequest().get(`/api/auth/callback?code=${code}&state=${state}`).cookies({ 'nf-oidc': flowCookie });
  expect(callback.statusCode).toBe(302);
  return { session: cookieValue(callback, 'nf-session') as string, returnTo: callback.headers.location as string };
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
    it('should redirect to the identity authorize endpoint with PKCE and set the flow cookie', async () => {
      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/auth/login');
      expect(response.statusCode).toBe(302);

      const url = new URL(response.headers.location as string);
      expect(url.origin).toBe(testIdP.issuer);
      expect(url.pathname).toBe('/oauth2/authorize');
      expect(url.searchParams.get('client_id')).toBe('novel-forge-web');
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:8080/api/auth/callback');
      expect(url.searchParams.get('resource')).toBe(AUTH_AUDIENCE);
      expect(cookieValue(response, 'nf-oidc')).toBeString();
    });

    it('should reject absolute returnTo urls with SES_003', async () => {
      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/auth/login?returnTo=https%3A%2F%2Fevil.example');
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('SES_003');
    });
  });

  describe('GET /api/auth/callback', () => {
    it('should reject a callback without the login flow cookie', async () => {
      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/auth/callback?code=abc&state=xyz');
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('SES_002');
    });

    it('should reject a state mismatch', async () => {
      const router = testEnv.getRouter({ authenticated: false });
      const login = await router.mockRequest().get('/api/auth/login');
      const flowCookie = cookieValue(login, 'nf-oidc') as string;
      const response = await router.mockRequest().get('/api/auth/callback?code=abc&state=tampered').cookies({ 'nf-oidc': flowCookie });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('SES_002');
    });

    it('should complete the code flow and redirect to the requested returnTo', async () => {
      const { session, returnTo } = await establishSession({ returnTo: '/projects/7' });
      expect(returnTo).toBe('/projects/7');
      expect(session).toBeString();
    });
  });

  describe('GET /api/auth/session', () => {
    it('should answer 401 (never a 200 null) when unauthenticated', async () => {
      const bare = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/auth/session');
      expect(bare.statusCode).toBe(401);
      expect(bare.json().code).toBe('SES_001');

      const garbage = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/auth/session').cookies({ 'nf-session': 'garbage' });
      expect(garbage.statusCode).toBe(401);
    });

    it('should return the flat session shape for an established session', async () => {
      const { session } = await establishSession();
      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/auth/session').cookies({ 'nf-session': session });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ userId: TEST_USER.userId, email: TEST_USER.email, name: TEST_USER.name });
    });

    it('should reject a session whose access token has expired', async () => {
      const { session } = await establishSession({ ttlSeconds: -60 });
      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/auth/session').cookies({ 'nf-session': session });
      expect(response.statusCode).toBe(401);
      expect(response.json().code).toBe('SES_001');
    });
  });

  describe('session cookie on the API surface', () => {
    it('should authenticate API routes through the session cookie alone', async () => {
      const { session } = await establishSession();
      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().get('/api/v1/projects').cookies({ 'nf-session': session });
      expect(response.statusCode).toBe(200);
    });

    it('should leave an explicit Authorization header untouched', async () => {
      const { session } = await establishSession();
      const response = await testEnv
        .getRouter({ authenticated: false })
        .mockRequest()
        .get('/api/v1/projects')
        .headers({ authorization: 'Bearer garbage' })
        .cookies({ 'nf-session': session });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear the session cookie', async () => {
      const { session } = await establishSession();
      const response = await testEnv.getRouter({ authenticated: false }).mockRequest().post('/api/auth/logout').cookies({ 'nf-session': session });
      expect(response.statusCode).toBe(204);
      expect(cookieValue(response, 'nf-session')).toBe('');
    });
  });
});
