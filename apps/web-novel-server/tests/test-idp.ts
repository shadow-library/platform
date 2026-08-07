import { createTestIdP, type TestTokenInput } from '@shadow-library/auth/testing';

/**
 * One in-process mock identity provider for the whole suite: discovery, JWKS, the token endpoint,
 * the first-party app-session routes, the PDP, the role catalog and service-access — all answered on
 * a random port. Its issuer is written into `AUTH_ISSUER` before any application module loads, so
 * both the publish guard's `AuthClient` and the reader login flow trust it. The registration it
 * publishes at `GET /api/v1/apps/me` is what the SDK derives audience, redirect URIs and scopes from
 * (D-21) — there is no `AUTH_AUDIENCE` any more.
 */

export const AUDIENCE = 'api://web-novel';
export const WEB_NOVEL_CLIENT_ID = 'web-novel';
export const WEB_NOVEL_CLIENT_SECRET = 'web-novel-test-secret';
export const FORGE_CLIENT_ID = 'novel-forge';
export const REDIRECT_URI = 'http://localhost:8080/api/auth/callback';
export const LOGIN_SCOPES = ['openid', 'profile', 'email'];

export const SESSION_COOKIE_NAME = '__Host-shadow-session';
export const LOGIN_COOKIE_NAME = '__Host-shadow-session-login';

export const idp = await createTestIdP({
  clientId: WEB_NOVEL_CLIENT_ID,
  clientSecret: WEB_NOVEL_CLIENT_SECRET,
  app: { appId: WEB_NOVEL_CLIENT_ID, audience: AUDIENCE, redirectUris: [REDIRECT_URI], scopes: LOGIN_SCOPES },
});

idp.setServiceAccess([{ callerClientId: FORGE_CLIENT_ID, method: '*', path: '/internal/*' }]);
process.env.AUTH_ISSUER = idp.issuer;

export function forgeToken(overrides: Partial<TestTokenInput> = {}): Promise<string> {
  return idp.issueToken({ sub: FORGE_CLIENT_ID, kind: 'service', clientId: FORGE_CLIENT_ID, audience: AUDIENCE, scopes: ['web-novel:publish'], ...overrides });
}

export function userToken(sub: string, overrides: Partial<TestTokenInput> = {}): Promise<string> {
  return idp.issueToken({ sub, kind: 'user', audience: AUDIENCE, scopes: [], ...overrides });
}
