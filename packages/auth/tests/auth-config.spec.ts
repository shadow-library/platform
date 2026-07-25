/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { type AuthClientConfig } from '@shadow-library/auth';
import { resolveAuthClientConfig, resolveAuthRoutes, resolveBrowserAuthConfig } from '@shadow-library/auth/module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The headline promise is that a service configures the SDK with an issuer, an app id and a credential
 * and writes no auth code — everything else identity already knows is read back from it. These specs
 * cover the environment path that promise rests on, rather than riding on the in-code overrides every
 * other spec uses.
 */
const ENVIRONMENT: Record<string, string> = {
  AUTH_ISSUER: 'https://identity.test',
  AUTH_APP_ID: 'svc-reports',
  AUTH_CLIENT_ASSERTION_PATH: '/var/run/secrets/shadow/identity-token',
  AUTH_ALLOWED_REDIRECTS: 'https://reports.test,https://admin.reports.test/ops',
};

/** Only the keys without a default can be reloaded mid-process; `Config` keeps a resolved value for good */
const CONFIG_KEYS = ['auth.issuer', 'auth.app-id', 'auth.client.assertion-path', 'auth.allowed-redirects'] as const;

const CLIENT: AuthClientConfig = { issuer: 'https://identity.test', appId: 'svc-reports', client: { id: 'svc-reports', secret: 's3cr3t' } };

describe('environment-driven configuration', () => {
  const original = new Map<string, string | undefined>();

  /** `Config` caches on load, so the keys are reloaded once the environment is in place — and again on the way out */
  const reload = (): void => void CONFIG_KEYS.forEach(key => Config.load(key, key === 'auth.allowed-redirects' ? { isArray: true } : {}));

  beforeAll(() => {
    for (const [key, value] of Object.entries(ENVIRONMENT)) {
      original.set(key, process.env[key]);
      process.env[key] = value;
    }
    reload();
  });

  afterAll(() => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    reload();
  });

  it('should need nothing but an issuer, an app id and a credential', () => {
    const config = resolveAuthClientConfig();
    expect(config.issuer).toBe('https://identity.test');
    expect(config.appId).toBe('svc-reports');

    /** The app id doubles as the OAuth client id, so a deploy names the application once */
    expect(config.client).toMatchObject({ id: 'svc-reports', assertionPath: ENVIRONMENT.AUTH_CLIENT_ASSERTION_PATH as string });
    expect(config.audience).toBeUndefined();
  });

  it('should default the refresh intervals that bound how stale derived config may get', () => {
    const config = resolveAuthClientConfig();
    expect(config.app?.refreshSeconds).toBe(300);
    expect(config.serviceAccess?.refreshSeconds).toBe(300);
    expect(config.strictScopes).toBe(false);
  });

  it('should let code override what the environment supplied', () => {
    const config = resolveAuthClientConfig({ issuer: 'https://other.test', audience: 'api://explicit', app: { refreshSeconds: 30 } });
    expect(config.issuer).toBe('https://other.test');
    expect(config.audience).toBe('api://explicit');
    expect(config.app?.refreshSeconds).toBe(30);
  });

  it('should turn the browser flow on from a credential alone, with no redirect uri to configure', () => {
    const browser = resolveBrowserAuthConfig(CLIENT, resolveAuthRoutes());
    expect(browser.enabled).toBe(true);

    /** Redirect uri, scopes and step-up url are identity's to answer, so nothing is settled here */
    expect(browser.redirectUri).toBeUndefined();
    expect(browser.scopes).toBeUndefined();
    expect(browser.stepUpUrl).toBeUndefined();
  });

  it('should read the comma-separated redirect allow-list, which stays local', () => {
    const browser = resolveBrowserAuthConfig(CLIENT, resolveAuthRoutes());
    expect(browser.allowedRedirects).toEqual(['https://reports.test', 'https://admin.reports.test/ops']);
  });

  it('should default the cookies to __Host- with attributes that cannot be silently loosened', () => {
    const browser = resolveBrowserAuthConfig(CLIENT, resolveAuthRoutes());
    expect(browser.cookieName).toBe('__Host-shadow-session');
    expect(browser.stateCookieName).toBe('__Host-shadow-session-login');
    expect(browser.postLoginRedirect).toBe('/');
    expect(browser.cookie).toMatchObject({ path: '/', httpOnly: true, secure: true, sameSite: 'Lax' });
    expect(browser.stateCookie.maxAge).toBeGreaterThan(0);
  });

  it('should let code override what the environment defaulted', () => {
    const browser = resolveBrowserAuthConfig(CLIENT, resolveAuthRoutes(), { cookieName: '__Host-reports-session', postLoginRedirect: '/dashboard' });
    expect(browser.cookieName).toBe('__Host-reports-session');
    expect(browser.stateCookieName).toBe('__Host-reports-session-login');
    expect(browser.postLoginRedirect).toBe('/dashboard');
  });

  it('should keep the login-state cookie on Lax so a Strict session cookie cannot break the callback', () => {
    const browser = resolveBrowserAuthConfig(CLIENT, resolveAuthRoutes(), { cookieSameSite: 'Strict' });
    expect(browser.cookie.sameSite).toBe('Strict');

    /** The callback arrives as a cross-site top-level navigation; Strict would withhold the state cookie */
    expect(browser.stateCookie.sameSite).toBe('Lax');
  });

  it('should refuse a __Host- cookie whose attributes break the prefix contract', () => {
    expect(() => resolveBrowserAuthConfig(CLIENT, resolveAuthRoutes(), { cookieSecure: false })).toThrow(/__Host-/);
    expect(() => resolveBrowserAuthConfig(CLIENT, resolveAuthRoutes(), { cookieDomain: 'reports.test' })).toThrow(/__Host-/);
  });

  it('should need no secret and no store for the transient login state', () => {
    const browser = resolveBrowserAuthConfig(CLIENT, resolveAuthRoutes());
    expect(browser.stateCookie).toMatchObject({ path: '/', httpOnly: true, secure: true });
    expect(browser).not.toHaveProperty('loginStateStore');
  });

  it('should stay off, and register no routes, for an api-only service', () => {
    expect(resolveBrowserAuthConfig(CLIENT, resolveAuthRoutes(), { enabled: false }).enabled).toBe(false);

    /** Without a credential the login could never complete, so the routes are not offered either */
    expect(resolveBrowserAuthConfig({ issuer: CLIENT.issuer, audience: 'api://reports' }, resolveAuthRoutes()).enabled).toBe(false);
  });

  it('should let a service move or turn off individual routes', () => {
    const routes = resolveAuthRoutes({ basePath: '/session', stepUp: '/elevate', login: false });
    expect(routes).toMatchObject({ basePath: '/session', login: false, stepUp: '/elevate' });
  });

  it('should leave back-channel logout off, since first-party revocation is pull-based', () => {
    /** Identity never sends a logout token to an app-session client; the route would accept nothing */
    expect(resolveAuthRoutes().backchannelLogout).toBe(false);
    expect(resolveAuthRoutes({ backchannelLogout: '/backchannel-logout' }).backchannelLogout).toBe('/backchannel-logout');
  });
});
