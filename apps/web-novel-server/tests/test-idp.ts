/**
 * Importing npm packages
 */
import { createTestIdP, type TestTokenInput } from '@shadow-library/auth/testing';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * One in-process mock identity provider for the whole suite: discovery, JWKS, token, and
 * service-access endpoints on a random port. Its issuer is written into `AUTH_ISSUER` before any
 * application module loads, so both the publish guard's `AuthClient` and the session module's
 * `RelyingParty` trust it.
 */

export const AUDIENCE = 'webnovel-server';
export const FORGE_CLIENT_ID = 'novel-forge-server';
export const RP_CLIENT_ID = 'webnovel-web';

export const idp = await createTestIdP();
idp.setServiceAccess([{ callerClientId: FORGE_CLIENT_ID, method: '*', path: '/internal/*' }]);
process.env.AUTH_ISSUER = idp.issuer;

/** An identity-issued M2M token as novel-forge-server would acquire it (scope `webnovel:publish`) */
export function forgeToken(overrides: Partial<TestTokenInput> = {}): Promise<string> {
  return idp.issueToken({ sub: FORGE_CLIENT_ID, kind: 'service', clientId: FORGE_CLIENT_ID, audience: AUDIENCE, scopes: ['webnovel:publish'], ...overrides });
}

/** An end-user access token; end-user tokens never carry the publish scope */
export function userToken(sub: string, overrides: Partial<TestTokenInput> = {}): Promise<string> {
  return idp.issueToken({ sub, kind: 'user', audience: AUDIENCE, scopes: [], ...overrides });
}
