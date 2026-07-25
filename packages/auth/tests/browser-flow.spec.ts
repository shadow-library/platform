/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import 'reflect-metadata';
import { type Response as MockResponse } from 'light-my-request';
import { Dispatcher, Module, ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { ContextService, FastifyModule, Get, HttpController } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { Authenticated, AuthModule, RequireElevation } from '@shadow-library/auth/module';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

interface MockRouter {
  mockRequest(options: { method: string; url: string; headers?: Record<string, string> }): Promise<MockResponse>;
}

/**
 * Declaring the constants
 *
 * The whole point of this spec: a service declares its own routes, imports `AuthModule.forRoot()`,
 * and gets login, callback, logout, session, step-up and principal resolution without writing a line
 * of auth code. Everything below drives that integration over real HTTP through the real router.
 */
const CLIENT = { id: 'svc-reports', secret: 's3cr3t' };
const AUDIENCE = 'api://reports';
const REDIRECT_URI = 'https://reports.test/auth/callback';
const SESSION_COOKIE = '__Host-shadow-session';
const STATE_COOKIE = '__Host-shadow-session-login';
const USER = 'user-42';

/** A top-level navigation, which is what earns a browser a redirect rather than a status code */
const BROWSER = { accept: 'text/html,application/xhtml+xml' };

@HttpController('/reports')
class ReportController {
  constructor(private readonly context: ContextService) {}

  @Get()
  @Authenticated()
  list(): { sub: string; aal: string } {
    const principal = this.context.getAuthPrincipal();
    return { sub: principal.sub, aal: principal.aal ?? 'none' };
  }

  @Get('/sensitive')
  @RequireElevation()
  sensitive(): { aal: string } {
    return { aal: this.context.getAuthPrincipal().aal ?? 'none' };
  }
}

@Module({ imports: [FastifyModule], controllers: [ReportController] })
class ReportModule {}

describe('first-party browser flow', () => {
  let idp: TestIdP;
  let app: ShadowApplication;
  let router: MockRouter;
  let sessionCookie: string;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret });

    @Module({
      imports: [
        FastifyModule.forRoot({
          imports: [
            AuthModule.forRoot({
              issuer: idp.issuer,
              audience: AUDIENCE,
              client: CLIENT,
              browser: { redirectUri: REDIRECT_URI, scopes: ['openid', 'reports:read'], sessionSecret: 'a-long-enough-test-secret', allowedRedirects: ['https://reports.test'] },
            }),
            ReportModule,
          ],
        }),
      ],
    })
    class TestAppModule {}

    app = await ShadowFactory.create(TestAppModule);
    await app.init();
    router = app.get(Dispatcher) as unknown as MockRouter;
  });
  afterAll(async () => {
    await app?.stop();
    idp.stop();
  });

  const get = (url: string, cookie?: string, headers: Record<string, string> = {}) =>
    router.mockRequest({ method: 'GET', url, headers: { ...headers, ...(cookie ? { cookie } : {}) } });

  /** `light-my-request` types `json()` as `undefined`, so the payload is parsed directly */
  const body = (response: MockResponse): Record<string, unknown> => JSON.parse(response.payload) as Record<string, unknown>;

  const post = (url: string, cookie?: string) => router.mockRequest({ method: 'POST', url, headers: cookie ? { cookie } : {} });

  /** Pulls one cookie out of the `set-cookie` headers the way a browser would */
  const readCookie = (response: MockResponse, name: string): string | undefined => {
    const headers = response.headers['set-cookie'];
    const all = Array.isArray(headers) ? headers : [headers];
    const match = all.find(entry => typeof entry === 'string' && entry.startsWith(`${name}=`));
    return typeof match === 'string' ? (match.split(';')[0] as string) : undefined;
  };

  /** Walks the login the way a browser does: bounce to identity, come back with a code and the state */
  const login = async (sub = USER): Promise<string> => {
    const started = await get('/auth/login?return_to=/reports');
    expect(started.statusCode).toBe(302);

    const authorize = new URL(started.headers.location as string);
    const state = authorize.searchParams.get('state') as string;
    const stateCookie = readCookie(started, STATE_COOKIE) as string;

    const code = idp.createAuthorizationCode({ sub, scopes: ['openid', 'reports:read'] });
    const callback = await get(`/auth/callback?code=${code}&state=${encodeURIComponent(state)}`, stateCookie);
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe('/reports');
    return readCookie(callback, SESSION_COOKIE) as string;
  };

  it('should build the authorization redirect with pkce, state, nonce and this api as the resource', async () => {
    const started = await get('/auth/login?return_to=/reports');
    const authorize = new URL(started.headers.location as string);

    expect(authorize.pathname).toBe('/oauth2/authorize');
    expect(authorize.searchParams.get('response_type')).toBe('code');
    expect(authorize.searchParams.get('client_id')).toBe(CLIENT.id);
    expect(authorize.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(authorize.searchParams.get('scope')).toBe('openid reports:read');
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('resource')).toBe(AUDIENCE);
    expect(authorize.searchParams.get('code_challenge')).toBeTruthy();

    /** The verifier, state and nonce leave only inside the sealed cookie */
    const stateCookie = readCookie(started, STATE_COOKIE) as string;
    expect(stateCookie).not.toContain(authorize.searchParams.get('state') as string);
  });

  it('should set a __Host- session cookie whose attributes cannot be downgraded', async () => {
    const started = await get('/auth/login');
    const raw = (started.headers['set-cookie'] as string[]).find(entry => entry.startsWith(STATE_COOKIE)) as string;
    expect(raw).toContain('HttpOnly');
    expect(raw).toContain('Secure');
    expect(raw).toContain('SameSite=Lax');
    expect(raw).toContain('Path=/');
  });

  it('should serve an authenticated request from a token minted for the session cookie', async () => {
    sessionCookie = await login();

    const response = await get('/reports', sessionCookie);
    expect(response.statusCode).toBe(200);
    expect(body(response)).toEqual({ sub: USER, aal: 'AAL1' });
  });

  it('should reuse the cached token instead of minting on every request', async () => {
    const before = idp.getRequestCount('/api/v1/app-sessions/token');
    await get('/reports', sessionCookie);
    await get('/reports', sessionCookie);
    expect(idp.getRequestCount('/api/v1/app-sessions/token')).toBe(before);
  });

  it('should report the current principal on the session route and 401 without a cookie', async () => {
    const authenticated = await get('/auth/session', sessionCookie);
    expect(authenticated.statusCode).toBe(200);
    expect(body(authenticated)).toMatchObject({ sub: USER, scopes: ['openid', 'reports:read'] });

    expect((await get('/auth/session')).statusCode).toBe(401);
  });

  it('should reject a callback whose state does not match the sealed cookie', async () => {
    const started = await get('/auth/login');
    const stateCookie = readCookie(started, STATE_COOKIE) as string;
    const code = idp.createAuthorizationCode({ sub: USER });

    expect((await get(`/auth/callback?code=${code}&state=forged`, stateCookie)).statusCode).toBe(400);
    expect((await get(`/auth/callback?code=${code}&state=forged`)).statusCode).toBe(400);
  });

  it('should refuse to send the browser to a return_to outside the allow-list', async () => {
    expect((await get('/auth/login?return_to=https://evil.test/steal')).statusCode).toBe(400);

    /** Protocol-relative targets read as a path to a careless check and as an origin to a browser */
    expect((await get(`/auth/login?return_to=${encodeURIComponent('//evil.test')}`)).statusCode).toBe(400);

    /** ...and a browser folds a backslash into a slash, so `/\evil.test` is the same attack spelled differently */
    expect((await get(`/auth/login?return_to=${encodeURIComponent('/\\evil.test')}`)).statusCode).toBe(400);
    expect((await get(`/auth/login?return_to=${encodeURIComponent('/\\\\evil.test')}`)).statusCode).toBe(400);
    expect((await get('/auth/login?return_to=https://reports.test/dashboard')).statusCode).toBe(302);
  });

  it('should answer a forged session cookie with 401 and stop asking identity about it', async () => {
    const forged = `${SESSION_COOKIE}=not-a-real-handle`;
    const before = idp.getRequestCount('/api/v1/app-sessions/token');

    expect((await get('/reports', forged)).statusCode).toBe(401);
    const afterFirst = idp.getRequestCount('/api/v1/app-sessions/token');
    expect(afterFirst).toBe(before + 1);

    /** A rejected handle is remembered as dead, so a retry loop cannot amplify into the identity service */
    expect((await get('/reports', forged)).statusCode).toBe(401);
    expect((await get('/reports', forged)).statusCode).toBe(401);
    expect(idp.getRequestCount('/api/v1/app-sessions/token')).toBe(afterFirst);
  });

  it('should survive a malformed cookie rather than wedging the browser into a 500', async () => {
    const response = await get('/reports', `junk=%zz; ${SESSION_COOKIE}=also-not-real`);
    expect(response.statusCode).toBe(401);
  });

  it('should not leak the sdk error behind a cookie failure to the browser', async () => {
    const response = await get('/reports', `${SESSION_COOKIE}=still-not-real`);
    expect(body(response)).toMatchObject({ code: 'IAM_001' });
  });

  describe('step-up', () => {
    let elevated: string;

    beforeAll(async () => {
      elevated = await login('user-stepping-up');
    });

    it('should bounce a browser to the step-up route when the route needs AAL2', async () => {
      const response = await get('/reports/sensitive', elevated, BROWSER);
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(`/auth/step-up?return_to=${encodeURIComponent('/reports/sensitive')}`);
    });

    it('should answer a non-browser caller with an actionable 403 instead of a redirect', async () => {
      const response = await get('/reports/sensitive', elevated);
      expect(response.statusCode).toBe(403);
      expect(body(response)).toMatchObject({ code: 'IAM_003' });
    });

    it('should hand the browser to identity when there is no step-up left to claim', async () => {
      const response = await get('/auth/step-up?return_to=%2Freports%2Fsensitive', elevated);
      expect(response.statusCode).toBe(302);

      const target = new URL(response.headers.location as string);
      expect(target.origin).toBe(new URL(idp.issuer).origin);
      expect(target.searchParams.get('acr_values')).toBe('AAL2');
      expect(target.searchParams.get('return_to')).toContain('claimed=1');
    });

    it('should claim the step-up and serve the elevated route on the retry', async () => {
      idp.setSteppedUp('user-stepping-up', true);

      const claimed = await get('/auth/step-up?return_to=%2Freports%2Fsensitive', elevated);
      expect(claimed.statusCode).toBe(302);
      expect(claimed.headers.location).toBe('/reports/sensitive');

      const response = await get('/reports/sensitive', elevated);
      expect(response.statusCode).toBe(200);
      expect(body(response)).toEqual({ aal: 'AAL2' });
    });

    it('should reuse the elevated token only while its grant window is known to be open', async () => {
      const before = idp.getRequestCount('/api/v1/app-sessions/token');
      await get('/reports/sensitive', elevated);
      await get('/reports/sensitive', elevated);
      expect(idp.getRequestCount('/api/v1/app-sessions/token')).toBe(before);
    });

    it('should never serve the elevated token to an ordinary request', async () => {
      const response = await get('/reports', elevated);
      expect(response.statusCode).toBe(200);
      expect(body(response)).toEqual({ sub: 'user-stepping-up', aal: 'AAL1' });

      /** The elevated mint asked for it explicitly; the ordinary one never does */
      expect(idp.getLastMintRequest()).toMatchObject({ resource: AUDIENCE, elevated: false });
    });
  });

  describe('session termination', () => {
    it('should clear the cookie and restart the login when identity ends the central session', async () => {
      const cookie = await login('user-signing-out');
      idp.endIdentitySession('user-signing-out');

      const response = await get('/reports', cookie, BROWSER);
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe(`/auth/login?return_to=${encodeURIComponent('/reports')}`);
      expect(readCookie(response, SESSION_COOKIE)).toBe(`${SESSION_COOKIE}=`);
    });

    it('should answer an api caller with 401 rather than a redirect when the session dies', async () => {
      const cookie = await login('user-api-caller');
      idp.endIdentitySession('user-api-caller');
      expect((await get('/reports', cookie)).statusCode).toBe(401);
    });

    it('should drop local sessions and cached tokens on a back-channel logout', async () => {
      const cookie = await login('user-backchannel');
      expect((await get('/reports', cookie)).statusCode).toBe(200);

      const logoutToken = await idp.issueLogoutToken({ sub: 'user-backchannel' });
      const notice = await router.mockRequest({
        method: 'POST',
        url: '/auth/backchannel-logout',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },

        ...({ payload: `logout_token=${encodeURIComponent(logoutToken)}` } as any),
      });
      expect(notice.statusCode).toBe(200);

      expect((await get('/reports', cookie)).statusCode).toBe(401);
    });

    it('should refuse the handle locally even when the revocation call fails', async () => {
      const cookie = await login('user-flaky-logout');
      idp.setEndpointFailure('/api/v1/app-sessions', true);

      const response = await post('/auth/logout', cookie);
      expect(response.statusCode).toBe(200);
      idp.setEndpointFailure('/api/v1/app-sessions', false);

      /** Identity never confirmed the revocation, so the handle may well still be live there — it must not be live here */
      expect((await get('/reports', cookie)).statusCode).toBe(401);
    });

    it('should revoke the app session and clear the cookie on logout', async () => {
      const cookie = await login('user-logging-out');
      const before = idp.getAppSessionCount();

      const response = await post('/auth/logout', cookie);
      expect(response.statusCode).toBe(200);
      expect(body(response)).toEqual({ success: true });
      expect(readCookie(response, SESSION_COOKIE)).toBe(`${SESSION_COOKIE}=`);
      expect(idp.getAppSessionCount()).toBe(before - 1);
    });
  });
});
