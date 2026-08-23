import { createTestIdP, type TestTokenInput } from '@shadow-library/auth/testing';

/**
 * One in-process mock identity provider for the whole suite: discovery, JWKS, the token endpoint, the
 * first-party app-session routes, the PDP, the role catalog and service-access — all answered on a
 * random port. Its issuer is written into `AUTH_ISSUER` before any application module loads, so
 * `MemoirAuthModule`'s `AuthClient` trusts it. The registration it publishes at `GET /api/v1/apps/me`
 * is what the SDK derives audience, redirect URIs and scopes from (D-21) — there is no `AUTH_AUDIENCE`.
 */

export const AUDIENCE = 'api://shadow-memoir';
export const CLIENT_ID = 'shadow-memoir';
export const CLIENT_SECRET = 'shadow-memoir-test-secret';
export const OTHER_SERVICE_CLIENT_ID = 'shadow-memoir-worker';
export const REDIRECT_URI = 'http://localhost:8080/api/auth/callback';
export const LOGIN_SCOPES = ['openid', 'profile', 'email', 'memoir:sync', 'memoir:account'];

export const idp = await createTestIdP({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  app: { appId: CLIENT_ID, audience: AUDIENCE, redirectUris: [REDIRECT_URI], scopes: LOGIN_SCOPES },
});

process.env.AUTH_ISSUER = idp.issuer;

export function userToken(sub: string, overrides: Partial<TestTokenInput> = {}): Promise<string> {
  return idp.issueToken({ sub, kind: 'user', audience: AUDIENCE, scopes: ['memoir:sync', 'memoir:account'], ...overrides });
}

export function serviceToken(overrides: Partial<TestTokenInput> = {}): Promise<string> {
  return idp.issueToken({ sub: OTHER_SERVICE_CLIENT_ID, kind: 'service', clientId: OTHER_SERVICE_CLIENT_ID, audience: AUDIENCE, scopes: [], ...overrides });
}
