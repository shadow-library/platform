/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AuthClient } from '@shadow-library/auth';
import { AppSessionService, resolveAuthRoutes, resolveBrowserAuthConfig } from '@shadow-library/auth/module';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * D-21: identity already stores the audience, the redirect URIs and the granted scopes, so a deploy
 * supplies an issuer, an app id and a credential and nothing else. The property worth pinning is not
 * just that the derivation works, but that it stays live — an admin granting a scope has to reach a
 * running service, which is the whole reason the registration is refreshed rather than read once.
 */
const APP_ID = 'svc-reports';
const CLIENT = { id: APP_ID, secret: 's3cr3t' };
const AUDIENCE = 'api://reports';
const REDIRECT_URI = 'https://reports.test/auth/callback';

/** Short enough that a test can watch a grant change land without sleeping for a perceptible time */
const REFRESH_SECONDS = 0.05;

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

describe('derived configuration', () => {
  let idp: TestIdP;

  beforeAll(async () => {
    idp = await createTestIdP({
      clientId: APP_ID,
      clientSecret: CLIENT.secret,
      app: { audience: AUDIENCE, redirectUris: ['https://reports.test/legacy/callback', REDIRECT_URI], scopes: ['openid', 'reports:read'] },
    });
  });
  afterAll(() => idp.stop());

  const client = (refreshSeconds = 300): AuthClient => new AuthClient({ issuer: idp.issuer, appId: APP_ID, client: CLIENT, app: { refreshSeconds } });

  const sessions = (auth: AuthClient): AppSessionService => new AppSessionService(auth, resolveBrowserAuthConfig({ issuer: idp.issuer, client: CLIENT }, resolveAuthRoutes()));

  it('should boot with an issuer, an app id and a credential alone', async () => {
    const auth = client();
    const runtime = await sessions(auth).warmUp();

    expect(runtime).toMatchObject({ clientId: APP_ID, audience: AUDIENCE, redirectUri: REDIRECT_URI, scopes: ['openid', 'reports:read'] });
    auth.stop();
  });

  it('should read the audience back rather than have it restated', async () => {
    const auth = client();
    await expect(auth.getAudience()).resolves.toBe(AUDIENCE);

    /** A token addressed to the derived audience verifies; one addressed elsewhere does not */
    await expect(auth.verify(await idp.issueToken({ sub: '42', audience: AUDIENCE }))).resolves.toMatchObject({ sub: '42' });
    await expect(auth.verify(await idp.issueToken({ sub: '42', audience: 'api://other' }))).rejects.toMatchObject({ code: 'AUDIENCE_MISMATCH' });
    auth.stop();
  });

  it('should pick the registered redirect uri that points at the callback route this process serves', async () => {
    const auth = client();
    const runtime = await sessions(auth).warmUp();

    /** The legacy uri is registered first, but only one of the two names a path this service answers on */
    expect(runtime.redirectUri).toBe(REDIRECT_URI);
    auth.stop();
  });

  it('should let a deployment pin the redirect uri when the registration cannot disambiguate it', async () => {
    const auth = client();
    const config = resolveBrowserAuthConfig({ issuer: idp.issuer, client: CLIENT }, resolveAuthRoutes(), { redirectUri: 'https://canary.reports.test/auth/callback' });
    const runtime = await new AppSessionService(auth, config).warmUp();

    expect(runtime.redirectUri).toBe('https://canary.reports.test/auth/callback');
    auth.stop();
  });

  it('should fail rather than guess when identity has no redirect uri registered', async () => {
    const auth = client();
    idp.setAppRegistration({ redirectUris: [] });

    await expect(sessions(auth).warmUp()).rejects.toMatchObject({ code: 'CONFIG_INVALID' });

    idp.setAppRegistration({ redirectUris: ['https://reports.test/legacy/callback', REDIRECT_URI] });
    auth.stop();
  });

  it('should take the step-up endpoint from discovery', async () => {
    const auth = client();
    await expect(auth.getStepUpEndpoint()).resolves.toBe(`${idp.issuer}/auth/step-up`);
    auth.stop();
  });

  it('should let an explicit audience override the derived one', async () => {
    const auth = new AuthClient({ issuer: idp.issuer, appId: APP_ID, client: CLIENT, audience: 'api://pinned' });
    await expect(auth.getAudience()).resolves.toBe('api://pinned');
    auth.stop();
  });

  it('should pick up a scope an admin granted within one refresh interval', async () => {
    const auth = client(REFRESH_SECONDS);
    const service = sessions(auth);
    expect((await service.warmUp()).scopes).toEqual(['openid', 'reports:read']);

    idp.setAppRegistration({ scopes: ['openid', 'reports:read', 'reports:write'] });
    await sleep(REFRESH_SECONDS * 1000 * 2);

    /** No redeploy, no restart: the next login already asks for what the admin granted */
    const started = await service.beginLogin('/reports');
    expect(new URL(started.url).searchParams.get('scope')).toBe('openid reports:read reports:write');

    idp.setAppRegistration({ scopes: ['openid', 'reports:read'] });
    auth.stop();
  });

  it('should keep the last good registration through an identity outage', async () => {
    const auth = client(REFRESH_SECONDS);
    await expect(auth.getAudience()).resolves.toBe(AUDIENCE);

    idp.setEndpointFailure('/api/v1/apps/me', true);
    await sleep(REFRESH_SECONDS * 1000 * 2);

    /** An outage must not change which tokens this service accepts */
    await expect(auth.getAudience()).resolves.toBe(AUDIENCE);
    idp.setEndpointFailure('/api/v1/apps/me', false);
    auth.stop();
  });

  it('should abort the boot when the registration cannot be resolved at all', async () => {
    const auth = client();
    idp.setEndpointFailure('/api/v1/apps/me', true);
    await expect(auth.getAudience()).rejects.toMatchObject({ code: 'APP_REGISTRATION_FAILED' });
    idp.setEndpointFailure('/api/v1/apps/me', false);
    auth.stop();
  });

  it('should refuse a credential provisioned against another application', async () => {
    const auth = new AuthClient({ issuer: idp.issuer, appId: 'svc-somebody-else', client: CLIENT });

    /** It would otherwise boot and then reject every token addressed to it, which reads as nothing at all */
    await expect(auth.getAudience()).rejects.toMatchObject({ code: 'CONFIG_INVALID' });
    auth.stop();
  });

  it('should refuse to start with neither an audience nor a credential to derive one', () => {
    expect(() => new AuthClient({ issuer: idp.issuer })).toThrow(/audience|credential/);
    expect(() => new AuthClient({ issuer: idp.issuer, client: { id: APP_ID } })).toThrow(/audience|credential/);
  });

  it('should share one resolve between concurrent callers', async () => {
    const auth = client();
    const before = idp.getRequestCount('/api/v1/apps/me');

    await Promise.all([auth.getAudience(), auth.getAudience(), auth.getAppRegistration()]);
    expect(idp.getRequestCount('/api/v1/apps/me')).toBe(before + 1);
    auth.stop();
  });
});
