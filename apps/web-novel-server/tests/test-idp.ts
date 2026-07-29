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
 * One in-process mock identity provider for the whole suite: discovery, JWKS, the token endpoint,
 * the first-party app-session routes, the PDP, the role catalog and service-access — all answered on
 * a random port. Its issuer is written into `AUTH_ISSUER` before any application module loads, so
 * both the publish guard's `AuthClient` and the reader login flow trust it. The registration it
 * publishes at `GET /api/v1/apps/me` is what the SDK derives audience, redirect URIs and scopes from
 * (D-21) — there is no `AUTH_AUDIENCE` any more.
 */

export const AUDIENCE = 'api://webnovel';
export const WEBNOVEL_CLIENT_ID = 'webnovel';
export const WEBNOVEL_CLIENT_SECRET = 'webnovel-test-secret';
export const FORGE_CLIENT_ID = 'novel-forge';
export const REDIRECT_URI = 'http://localhost:8080/api/auth/callback';
export const LOGIN_SCOPES = ['openid', 'profile', 'email'];

/** The opaque app-session cookie the SDK sets, and its transient login-state sibling */
export const SESSION_COOKIE_NAME = '__Host-shadow-session';
export const LOGIN_COOKIE_NAME = '__Host-shadow-session-login';

export const idp = await createTestIdP({
  clientId: WEBNOVEL_CLIENT_ID,
  clientSecret: WEBNOVEL_CLIENT_SECRET,
  app: { appId: WEBNOVEL_CLIENT_ID, audience: AUDIENCE, redirectUris: [REDIRECT_URI], scopes: LOGIN_SCOPES },
});

/** novel-forge is the only M2M caller identity allowlists on this service's internal surface */
idp.setServiceAccess([{ callerClientId: FORGE_CLIENT_ID, method: '*', path: '/internal/*' }]);
process.env.AUTH_ISSUER = idp.issuer;

/** An identity-issued M2M token as novel-forge would acquire it (scope `webnovel:publish`, aud `api://webnovel`) */
export function forgeToken(overrides: Partial<TestTokenInput> = {}): Promise<string> {
  return idp.issueToken({ sub: FORGE_CLIENT_ID, kind: 'service', clientId: FORGE_CLIENT_ID, audience: AUDIENCE, scopes: ['webnovel:publish'], ...overrides });
}

/** An end-user access token; end-user tokens never carry the publish scope */
export function userToken(sub: string, overrides: Partial<TestTokenInput> = {}): Promise<string> {
  return idp.issueToken({ sub, kind: 'user', audience: AUDIENCE, scopes: [], ...overrides });
}
