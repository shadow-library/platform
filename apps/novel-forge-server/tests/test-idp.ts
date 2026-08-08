import { createTestIdP } from '@shadow-library/auth/testing';
import { Config } from '@shadow-library/common';

/**
 * One in-process mock identity provider for the whole test run. This module MUST be evaluated before
 * `@server/app.module`: `AuthModule.forRoot()` resolves the issuer/app-id/credential at import time
 * and derives everything else (audience, redirect URIs, granted scopes) from the mock's
 * `GET /api/v1/apps/me`, so the mock's ephemeral URL and the app-id + credential are pre-seeded into
 * the config cache here (a pre-seeded cache entry wins over any later `Config.load`), the same trick
 * the database URL uses.
 */

/** The single client that is both this app's browser-login client and its M2M identity (client id == app id) */
export const APP_ID = 'novel-forge';
export const CLIENT_SECRET = 'test-client-secret';

/** Derived from the mock registration below, and the `aud` of every token the app accepts or mints for itself */
export const AUTH_AUDIENCE = 'api://novel-forge';

/** Must carry the callback path so the SDK picks it as this deployment's redirect uri */
export const CALLBACK_URI = 'http://localhost:8080/api/auth/callback';

export const TEST_USER = { userId: '42' };

export const testIdP = await createTestIdP({
  clientId: APP_ID,
  clientSecret: CLIENT_SECRET,
  app: {
    appId: APP_ID,
    name: 'Novel Forge',
    audience: AUTH_AUDIENCE,
    redirectUris: [CALLBACK_URI],
    scopes: ['authz:check', 'app-session:manage'],
  },
});

Config['cache'].set('auth.issuer', testIdP.issuer);
Config['cache'].set('auth.app-id', APP_ID);
Config['cache'].set('auth.client.secret', CLIENT_SECRET);

// The app-boot suites have no reader service wired, so the controller must not fire background
// reader-push jobs that would race their ledger assertions (a boolean, so `Config.get` returns it as
// stored — a `'false'` string would read truthy). Publish-runner drives the executor directly instead.
Config['cache'].set('publishing.auto-push', false);

/** Mints a bearer token accepted by the app's AuthGuard for the shared test user */
export function issueTestToken(overrides: { sub?: string; scopes?: string[]; ttlSeconds?: number } = {}): Promise<string> {
  return testIdP.issueToken({ sub: overrides.sub ?? TEST_USER.userId, audience: AUTH_AUDIENCE, scopes: overrides.scopes, ttlSeconds: overrides.ttlSeconds });
}
