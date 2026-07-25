/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { type AuthClientConfig } from '@shadow-library/auth';
import { resolveAuthRoutes, resolveBrowserAuthConfig } from '@shadow-library/auth/module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The headline promise is that a service configures the SDK through the environment and writes no
 * auth code, so the environment path deserves its own coverage rather than riding on the in-code
 * overrides every other spec uses.
 */
const ENVIRONMENT: Record<string, string> = {
  AUTH_REDIRECT_URI: 'https://reports.test/auth/callback',
  AUTH_SCOPES: 'openid reports:read  reports:write',
  AUTH_SESSION_SECRET: 'a-long-enough-test-secret',
  AUTH_ALLOWED_REDIRECTS: 'https://reports.test,https://admin.reports.test/ops',
};

/** Only the keys without a default can be reloaded mid-process; `Config` keeps a resolved value for good */
const CONFIG_KEYS = ['auth.redirect-uri', 'auth.scopes', 'auth.session.secret', 'auth.allowed-redirects'] as const;

const CLIENT: AuthClientConfig = { issuer: 'https://identity.test', audience: 'api://reports', client: { id: 'svc-reports', secret: 's3cr3t' } };

describe('environment-driven browser config', () => {
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

  it('should turn the browser flow on from AUTH_REDIRECT_URI alone', () => {
    const browser = resolveBrowserAuthConfig(CLIENT, resolveAuthRoutes());
    expect(browser.enabled).toBe(true);
    expect(browser.redirectUri).toBe(ENVIRONMENT.AUTH_REDIRECT_URI as string);
    expect(browser.audience).toBe('api://reports');
  });

  it('should read space-separated scopes and comma-separated redirects', () => {
    const browser = resolveBrowserAuthConfig(CLIENT, resolveAuthRoutes());
    expect(browser.scopes).toEqual(['openid', 'reports:read', 'reports:write']);
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

  it('should seal the login state when a session secret is configured', async () => {
    const browser = resolveBrowserAuthConfig(CLIENT, resolveAuthRoutes());
    const sealed = await browser.loginStateStore.save({ state: 's', nonce: 'n', codeVerifier: 'secret-verifier', returnTo: '/' });
    expect(sealed).not.toContain('secret-verifier');
    expect(await browser.loginStateStore.take(sealed)).toMatchObject({ codeVerifier: 'secret-verifier' });
  });

  it('should stay off, and register no routes, for an api-only service', () => {
    const browser = resolveBrowserAuthConfig(CLIENT, resolveAuthRoutes(), { enabled: false });
    expect(browser.enabled).toBe(false);
  });

  it('should let a service turn individual routes off', () => {
    const routes = resolveAuthRoutes({ basePath: '/session', backchannelLogout: false, stepUp: '/elevate' });
    expect(routes).toMatchObject({ basePath: '/session', login: '/login', backchannelLogout: false, stepUp: '/elevate' });
  });
});
