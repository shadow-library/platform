/**
 * Importing npm packages
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type Mock, spyOn } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AuthClient } from '@shadow-library/auth';
import { AppSessionService } from '@shadow-library/auth/module';
import { createOfflineAuth, createTestIdP, type OfflineAuth } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The offline kit exists so unit tests and an infra-free app boot never open a socket; every spec here
 * watches the global `fetch` to hold it to that.
 */
const ORG = 'org-1';

describe('createOfflineAuth', () => {
  let auth: OfflineAuth;
  let network: Mock<typeof fetch>;

  beforeAll(async () => {
    auth = await createOfflineAuth({ clientId: 'svc-offline' });
  });

  beforeEach(() => {
    network = spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
  });

  afterAll(() => auth.stop());

  it('should verify a token addressed to the application', async () => {
    const principal = await auth.client.verify(await auth.issueToken({ sub: 'user-1', org: ORG }));
    expect(principal).toMatchObject({ kind: 'user', sub: 'user-1', org: ORG });
  });

  it('should refuse a token addressed to another audience', async () => {
    const token = await auth.issueToken({ sub: 'user-1', audience: 'api://elsewhere' });
    await expect(auth.client.verify(token)).rejects.toMatchObject({ code: 'AUDIENCE_MISMATCH' });
  });

  it('should answer permission checks from the grants the idp holds', async () => {
    const principal = { kind: 'user' as const, sub: 'user-2' };
    auth.idp.grantPermission(principal, ORG, 'posts:write');

    expect(await auth.client.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(true);
    expect(await auth.client.check({ action: 'posts:delete', organisationId: ORG, principal })).toBe(false);
  });

  it('should complete the startup calls the auth module makes at boot', async () => {
    auth.idp.setServiceAccess([{ callerClientId: 'svc-peer', method: 'GET', path: '/api/*' }]);
    await auth.sessions.warmUp();
    await auth.client.syncRoles({ permissions: [{ name: 'posts:write' }], roles: [{ name: 'editor', permissions: ['posts:write'] }] });
    await auth.client.loadServiceAccess();

    expect(auth.idp.getLastCatalog()?.manifest.roles).toHaveLength(1);
    expect(auth.client.isServiceCallerAllowed('svc-peer', 'GET', '/api/posts')).toBe(true);
  });

  it('should hand out override entries for the SDK client and session service', () => {
    const [client, sessions] = auth.providers as { token: unknown; useFactory: () => unknown }[];

    expect(client?.token).toBe(AuthClient);
    expect(client?.useFactory()).toBe(auth.client);
    expect(sessions?.token).toBe(AppSessionService);
    expect(sessions?.useFactory()).toBe(auth.sessions);
  });
});

describe('createTestIdP without a server', () => {
  it('should answer through its transport under the placeholder issuer', async () => {
    const idp = await createTestIdP({ serve: false });
    const response = await idp.transport(`${idp.issuer}/.well-known/openid-configuration`);

    expect(idp.url).toBe('https://identity.test');
    expect(await response.json()).toMatchObject({ issuer: 'https://identity.test' });
    idp.stop();
  });
});
