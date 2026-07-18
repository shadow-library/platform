/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { createTestIdP } from '@shadow-library/auth/testing';
import { Config } from '@shadow-library/common';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * One in-process mock identity provider for the whole test run. This module MUST be evaluated
 * before `@server/app.module`: the auth modules resolve the issuer/audience/client configs at
 * import time, so the IdP's ephemeral URL is pre-seeded into the config cache here (a pre-seeded
 * cache entry wins over any later `Config.load`), the same trick the database URL uses.
 */

export const AUTH_AUDIENCE = 'api://novel-forge';
export const RP_CLIENT = { id: 'novel-forge-web', secret: 'test-rp-secret' };
export const TEST_USER = { userId: '42', email: 'author@example.com', name: 'Test Author' };

export const testIdP = await createTestIdP({ clientId: RP_CLIENT.id, clientSecret: RP_CLIENT.secret });

Config['cache'].set('auth.issuer', testIdP.issuer);
Config['cache'].set('auth.audience', AUTH_AUDIENCE);
Config['cache'].set('auth.rp.client.id', RP_CLIENT.id);
Config['cache'].set('auth.rp.client.secret', RP_CLIENT.secret);

/** Mints a bearer token accepted by the app's AuthGuard for the shared test user */
export function issueTestToken(overrides: { sub?: string; scopes?: string[]; ttlSeconds?: number } = {}): Promise<string> {
  return testIdP.issueToken({ sub: overrides.sub ?? TEST_USER.userId, audience: AUTH_AUDIENCE, scopes: overrides.scopes, ttlSeconds: overrides.ttlSeconds });
}
