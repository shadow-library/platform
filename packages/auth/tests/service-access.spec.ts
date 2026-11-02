import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from 'bun:test';

import { AuthClient } from '@shadow-library/auth';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

// Rules loaded once at boot make revocation latency unbounded; these pin the refresh that closes that gap and that an identity outage does not become a fleet-wide revocation
const AUDIENCE = 'api://pulse';
const CLIENT = { id: 'svc-pulse', secret: 's3cr3t' };
const RULE = { callerClientId: 'svc-indexer', method: 'POST', path: '/api/v1/index' };

const SERVICE_ACCESS_PATH = '/api/v1/authz/service-access';

const REFRESH_SECONDS = 0.05;
const REFRESH_MS = REFRESH_SECONDS * 1000;

// `setImmediate` is not faked, and runs only once every microtask a fired refresh queued has drained
const settle = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

describe('service access rules', () => {
  let idp: TestIdP;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret });
  });
  afterAll(() => idp.stop());
  afterEach(() => jest.useRealTimers());

  const client = (refreshSeconds = REFRESH_SECONDS): AuthClient => new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT, serviceAccess: { refreshSeconds } });

  // No socket in the path, so a refresh fired by a faked interval completes before `settle` resolves and the next tick cannot coalesce into it
  const inProcessClient = (): AuthClient =>
    new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT, serviceAccess: { refreshSeconds: REFRESH_SECONDS }, fetch: idp.transport });

  it('should deny every caller until the rules have been loaded', async () => {
    const auth = client();
    expect(auth.isServiceCallerAllowed(RULE.callerClientId, RULE.method, RULE.path)).toBe(false);
    auth.stop();
  });

  it('should abort the boot when the initial load fails', async () => {
    const auth = client();
    idp.setEndpointFailure(SERVICE_ACCESS_PATH, true);
    await expect(auth.loadServiceAccess()).rejects.toMatchObject({ code: 'SERVICE_ACCESS_FAILED' });
    idp.setEndpointFailure(SERVICE_ACCESS_PATH, false);
    auth.stop();
  });

  it('should require service-account credentials', () => {
    const auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE });
    expect(() => auth.loadServiceAccess()).toThrow(/CONFIG_INVALID|configuration/);
    expect(() => auth.refreshServiceAccess()).toThrow(/CONFIG_INVALID|configuration/);
  });

  it('should deny a caller whose rule an admin removed, with no restart', async () => {
    const auth = client();
    idp.setServiceAccess([RULE]);
    await auth.loadServiceAccess();
    expect(auth.isServiceCallerAllowed(RULE.callerClientId, RULE.method, RULE.path)).toBe(true);

    idp.setServiceAccess([]);
    await auth.refreshServiceAccess();

    expect(auth.isServiceCallerAllowed(RULE.callerClientId, RULE.method, RULE.path)).toBe(false);
    auth.stop();
  });

  it('should keep re-fetching on the interval so nothing has to drive the refresh', async () => {
    jest.useFakeTimers();
    const auth = inProcessClient();
    await auth.loadServiceAccess();

    const before = idp.getRequestCount(SERVICE_ACCESS_PATH);
    for (const tick of [1, 2, 3]) {
      jest.advanceTimersByTime(REFRESH_MS);
      await settle();
      expect(idp.getRequestCount(SERVICE_ACCESS_PATH)).toBe(before + tick);
    }
    auth.stop();
  });

  it('should keep the last good rules when a refresh fails', async () => {
    const auth = client();
    idp.setServiceAccess([RULE]);
    await auth.loadServiceAccess();

    idp.setEndpointFailure(SERVICE_ACCESS_PATH, true);
    await expect(auth.refreshServiceAccess()).resolves.toEqual([RULE]);

    // An identity outage must not revoke every M2M caller of every service at once
    expect(auth.isServiceCallerAllowed(RULE.callerClientId, RULE.method, RULE.path)).toBe(true);
    idp.setEndpointFailure(SERVICE_ACCESS_PATH, false);
    auth.stop();
  });

  it('should share one round trip between concurrent refreshes', async () => {
    const auth = client();
    idp.setServiceAccess([RULE]);
    await auth.loadServiceAccess();

    const before = idp.getRequestCount(SERVICE_ACCESS_PATH);
    await Promise.all([auth.refreshServiceAccess(), auth.refreshServiceAccess(), auth.refreshServiceAccess()]);
    expect(idp.getRequestCount(SERVICE_ACCESS_PATH)).toBe(before + 1);
    auth.stop();
  });

  it('should stop refreshing once the client is stopped', async () => {
    jest.useFakeTimers();
    const auth = inProcessClient();
    await auth.loadServiceAccess();

    const before = idp.getRequestCount(SERVICE_ACCESS_PATH);
    jest.advanceTimersByTime(REFRESH_MS);
    await settle();
    expect(idp.getRequestCount(SERVICE_ACCESS_PATH)).toBe(before + 1);

    auth.stop();
    jest.advanceTimersByTime(REFRESH_MS * 4);
    await settle();
    expect(idp.getRequestCount(SERVICE_ACCESS_PATH)).toBe(before + 1);
  });

  it('should refuse a non-positive refresh interval rather than spinning', () => {
    expect(() => client(0)).toThrow(/refresh interval/);
    expect(() => client(-5)).toThrow(/refresh interval/);
  });
});
