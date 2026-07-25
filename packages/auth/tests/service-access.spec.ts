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
 * Rules loaded once at boot make revocation latency unbounded: an admin removing a caller's access has
 * no effect until somebody restarts the target service. These specs pin the refresh that closes that
 * gap, and — just as important — that an identity outage does not turn into a fleet-wide revocation.
 */
const AUDIENCE = 'api://pulse';
const CLIENT = { id: 'svc-pulse', secret: 's3cr3t' };
const RULE = { callerClientId: 'svc-indexer', method: 'POST', path: '/api/v1/index' };

const SERVICE_ACCESS_PATH = '/api/v1/authz/service-access';

/** Only for proving a timer does *not* fire; every other wait is driven by the mock's request counter */
const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Short enough that a test can watch the interval fire without sleeping for a perceptible time */
const REFRESH_SECONDS = 0.05;

describe('service access rules', () => {
  let idp: TestIdP;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret });
  });
  afterAll(() => idp.stop());

  const client = (refreshSeconds = REFRESH_SECONDS): AuthClient => new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT, serviceAccess: { refreshSeconds } });

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
    const auth = client();
    await auth.loadServiceAccess();

    /** Two more calls than the initial load proves the interval is rearming, not firing once */
    const target = idp.getRequestCount(SERVICE_ACCESS_PATH) + 2;
    await idp.waitForRequest(SERVICE_ACCESS_PATH, target);
    expect(idp.getRequestCount(SERVICE_ACCESS_PATH)).toBeGreaterThanOrEqual(target);
    auth.stop();
  });

  it('should keep the last good rules when a refresh fails', async () => {
    const auth = client();
    idp.setServiceAccess([RULE]);
    await auth.loadServiceAccess();

    idp.setEndpointFailure(SERVICE_ACCESS_PATH, true);
    await expect(auth.refreshServiceAccess()).resolves.toEqual([RULE]);

    /** An identity outage must not revoke every M2M caller of every service at once */
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
    const auth = client();
    await auth.loadServiceAccess();
    auth.stop();

    /** A timer that outlives the application would keep calling identity from a dead process */
    const before = idp.getRequestCount(SERVICE_ACCESS_PATH);
    const fired = await Promise.race([idp.waitForRequest(SERVICE_ACCESS_PATH, before + 1).then(() => true), sleep(REFRESH_SECONDS * 1000 * 4).then(() => false)]);
    expect(fired).toBe(false);
    expect(idp.getRequestCount(SERVICE_ACCESS_PATH)).toBe(before);
  });

  it('should refuse a non-positive refresh interval rather than spinning', () => {
    expect(() => client(0)).toThrow(/refresh interval/);
    expect(() => client(-5)).toThrow(/refresh interval/);
  });
});
