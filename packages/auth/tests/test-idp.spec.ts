/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AuthClient } from '@shadow-library/auth';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * `createTestIdP` is public surface: a consuming service tests its guards, its login and its step-up
 * against it instead of a live identity. So the mock has to answer for every part of the v1.1 protocol
 * a consumer can hit, and these specs pin that parity — a mock that quietly lags the SDK turns green
 * suites into false confidence.
 */
const APP_ID = 'svc-parity';
const CLIENT = { id: APP_ID, secret: 's3cr3t' };
const AUDIENCE = 'api://parity';

describe('createTestIdP parity', () => {
  let idp: TestIdP;
  let auth: AuthClient;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: APP_ID, clientSecret: CLIENT.secret, app: { audience: AUDIENCE, scopes: ['openid', 'parity:read'] } });
    auth = new AuthClient({ issuer: idp.issuer, appId: APP_ID, client: CLIENT });
  });
  afterAll(() => {
    auth.stop();
    idp.stop();
  });

  it('should publish the derived-configuration endpoints A-3 reads', async () => {
    const document = await auth.getDiscovery();
    expect(document.step_up_endpoint).toBe(`${idp.issuer}/auth/step-up`);
    expect(document.app_session_endpoint).toBe(`${idp.issuer}/api/v1/app-sessions`);

    await expect(auth.getAppRegistration()).resolves.toMatchObject({ appId: APP_ID, audience: AUDIENCE, scopes: ['openid', 'parity:read'] });
  });

  it('should let a test rewrite the registration an admin would have changed', () => {
    idp.setAppRegistration({ scopes: ['openid'] });
    expect(idp.getAppRegistration().scopes).toEqual(['openid']);

    idp.setAppRegistration({ scopes: ['openid', 'parity:read'] });
    expect(idp.getAppRegistration()).toMatchObject({ appId: APP_ID, audience: AUDIENCE });
  });

  it('should bind a step-up to its beneficiary and record what the claim asked for', async () => {
    const code = idp.createAuthorizationCode({ sub: 'user-1', scopes: ['openid'] });
    const session = await auth.appSessions.createSession({ code, codeVerifier: 'v', redirectUri: 'https://app.test/auth/callback' });

    idp.setSteppedUp('user-1', { clientId: 'svc-other' });
    await expect(auth.appSessions.claimElevation(session.sessionHandle, AUDIENCE)).rejects.toMatchObject({ code: 'ELEVATION_INTENT_MISMATCH' });
    expect(idp.getLastElevationRequest()).toMatchObject({ resource: AUDIENCE });

    idp.setSteppedUp('user-1', { clientId: APP_ID, resource: AUDIENCE });
    await expect(auth.appSessions.claimElevation(session.sessionHandle, AUDIENCE)).resolves.toMatchObject({ expiresAt: expect.any(String) });
  });

  it('should intersect a token exchange and refuse a second hop', async () => {
    const subjectToken = await idp.issueToken({ sub: 'user-1', audience: AUDIENCE, scopes: ['parity:read'] });
    await expect(auth.exchangeUserToken({ subjectToken, resource: 'api://downstream', scopes: ['parity:read', 'parity:write'] })).resolves.toMatchObject({
      scope: ['parity:read'],
    });

    idp.setUnexchangeableScopes(['parity:read']);
    await expect(auth.exchangeUserToken({ subjectToken, resource: 'api://downstream', scopes: ['parity:read'] })).resolves.toMatchObject({ scope: [] });
    idp.setUnexchangeableScopes([]);

    const delegated = await idp.issueToken({ sub: 'user-1', audience: AUDIENCE, claims: { act: { sub: 'svc-upstream' } } });
    await expect(auth.exchangeUserToken({ subjectToken: delegated, resource: 'api://downstream' })).rejects.toMatchObject({ code: 'TOKEN_EXCHANGE_REFUSED' });
  });

  it('should refuse a destructive catalog sync until it is forced', async () => {
    const manifest = { permissions: [{ name: 'parity:read' }], roles: [] };
    idp.setCatalogGuardrail(true);

    await expect(auth.syncRoles(manifest)).rejects.toMatchObject({ code: 'ROLE_SYNC_REFUSED' });
    await expect(auth.syncRoles(manifest, { force: true })).resolves.toMatchObject({ permissionsUpserted: 1 });

    idp.setCatalogGuardrail(false);
  });

  it('should let a test wait for a scheduled refresh rather than sleep past it', async () => {
    const refreshing = new AuthClient({ issuer: idp.issuer, appId: APP_ID, client: CLIENT, serviceAccess: { refreshSeconds: 0.05 } });
    await refreshing.loadServiceAccess();

    const target = idp.getRequestCount('/api/v1/authz/service-access') + 1;
    await idp.waitForRequest('/api/v1/authz/service-access', target);
    expect(idp.getRequestCount('/api/v1/authz/service-access')).toBeGreaterThanOrEqual(target);
    refreshing.stop();
  });

  it('should refuse every app-session route to a caller holding only the handle', async () => {
    const code = idp.createAuthorizationCode({ sub: 'user-2', scopes: ['openid'] });
    const session = await auth.appSessions.createSession({ code, codeVerifier: 'v', redirectUri: 'https://app.test/auth/callback' });
    const handleOnly = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT, fetch: idp.handleOnlyTransport() });

    await expect(handleOnly.appSessions.mintToken({ sessionHandle: session.sessionHandle, resource: AUDIENCE })).rejects.toMatchObject({ code: 'APP_SESSION_FAILED' });
    handleOnly.stop();
  });
});
