/**
 * Importing npm packages
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type Mock, setSystemTime, spyOn } from 'bun:test';
import { utils } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AuthClient, CheckPrincipal, type FetchLike } from '@shadow-library/auth';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const AUDIENCE = 'api://pulse';
const ORG = '7';

describe('AuthClient.check (pdp client)', () => {
  let idp: TestIdP;
  let auth: AuthClient;
  let counter = 0;
  let principal: CheckPrincipal;

  beforeAll(async () => {
    idp = await createTestIdP();
    auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE });
  });
  afterAll(() => idp.stop());

  const freshPrincipal = (): CheckPrincipal => ({ kind: 'user', sub: `user-${++counter}` });

  it('should deny by default and permit granted actions', async () => {
    principal = freshPrincipal();
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(false);
    idp.grantPermission(principal, ORG, 'posts:write');
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(false);
    idp.bumpAuthzVersion();
    expect(await auth.check({ action: 'posts:read', organisationId: ORG, principal })).toBe(false);
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(true);
  });

  it('should deny when no organisation can be resolved', async () => {
    expect(await auth.check({ action: 'posts:write', principal: freshPrincipal() })).toBe(false);
  });

  it('should fall back to the principal organisation', async () => {
    principal = freshPrincipal();
    const withOrg = { ...principal, org: ORG };
    idp.grantPermission(principal, ORG, 'posts:write');
    expect(await auth.check({ action: 'posts:write', principal: withOrg })).toBe(true);
  });

  it('should cache decisions within the ttl', async () => {
    principal = freshPrincipal();
    idp.grantPermission(principal, ORG, 'posts:write');
    const before = idp.getRequestCount('/api/v1/authz/check');
    await auth.check({ action: 'posts:write', organisationId: ORG, principal });
    await auth.check({ action: 'posts:write', organisationId: ORG, principal });
    await auth.check({ action: 'posts:write', organisationId: ORG, principal });
    expect(idp.getRequestCount('/api/v1/authz/check')).toBe(before + 1);
  });

  it('should discard cached decisions when the authz version bumps', async () => {
    principal = freshPrincipal();
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(false);

    idp.grantPermission(principal, ORG, 'posts:write');
    idp.bumpAuthzVersion();
    // The bump is observed piggybacked on the next uncached response for this principal
    await auth.check({ action: 'posts:read', organisationId: ORG, principal });
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(true);
  });

  it('should send a bot as a service account and cache its decisions for at most 60 s, even when not asked to', async () => {
    const bot: CheckPrincipal = { kind: 'bot', sub: `bot_${++counter}`, org: ORG };
    idp.grantPermission(bot, ORG, 'posts:write');
    const before = idp.getRequestCount('/api/v1/authz/check');
    expect(await auth.check({ action: 'posts:write', principal: bot })).toBe(true);
    expect(await auth.check({ action: 'posts:write', principal: bot })).toBe(true);
    expect(idp.getRequestCount('/api/v1/authz/check')).toBe(before + 1);

    try {
      setSystemTime(Date.now() + 61_000);
      await auth.check({ action: 'posts:write', principal: bot });
      expect(idp.getRequestCount('/api/v1/authz/check')).toBe(before + 2);
    } finally {
      setSystemTime();
    }
  });

  it('should batch checks with checkAll', async () => {
    principal = freshPrincipal();
    idp.grantPermission(principal, ORG, 'posts:read');
    const decisions = await auth.checkAll([
      { action: 'posts:read', organisationId: ORG, principal },
      { action: 'posts:delete', organisationId: ORG, principal },
    ]);
    expect(decisions).toEqual([true, false]);
  });

  it('should fail closed on pdp outage unless the caller opted into fail-open', async () => {
    principal = freshPrincipal();
    idp.grantPermission(principal, ORG, 'posts:write');
    idp.setEndpointFailure('/api/v1/authz/check', true);
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(false);
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal }, { failOpen: true })).toBe(true);
    idp.setEndpointFailure('/api/v1/authz/check', false);
  });
});

describe('AuthClient.check under an identity throttle', () => {
  let idp: TestIdP;
  let counter = 0;
  let sleep: Mock<(duration: number) => Promise<void>>;

  beforeAll(async () => {
    idp = await createTestIdP();
  });
  afterAll(() => idp.stop());
  beforeEach(() => {
    sleep = spyOn(utils.temporal, 'sleep').mockResolvedValue();
  });
  afterEach(() => sleep.mockRestore());

  const freshPrincipal = (): CheckPrincipal => ({ kind: 'user', sub: `throttled-${++counter}` });

  /** Answers the first `times` pdp calls the way identity's rate limiter does, then lets the rest through */
  const throttledClient = (retryAfter: string | undefined, times = Number.POSITIVE_INFINITY): { auth: AuthClient; throttled: () => number } => {
    let throttled = 0;
    const headers: Record<string, string> = retryAfter === undefined ? {} : { 'retry-after': retryAfter };
    const fetchFn: FetchLike = (url, init) => {
      if (new URL(url).pathname !== '/api/v1/authz/check' || throttled >= times) return fetch(url, init);
      throttled += 1;
      return Promise.resolve(Response.json({ code: 'SEC_001', message: 'Too many requests' }, { status: 429, headers }));
    };
    return { auth: new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, fetch: fetchFn }), throttled: () => throttled };
  };

  it('should retry once, after the retry-after identity sent plus jitter, and return the real decision', async () => {
    const principal = freshPrincipal();
    idp.grantPermission(principal, ORG, 'posts:write');
    const { auth, throttled } = throttledClient('1', 1);

    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal })).toBe(true);
    expect(throttled()).toBe(1);
    expect(sleep).toHaveBeenCalledTimes(1);
    const waited = sleep.mock.calls[0]?.[0] as number;
    expect(waited).toBeGreaterThanOrEqual(1_000);
    expect(waited).toBeLessThan(1_250);
  });

  it('should surface a throttle that outlasts its one retry as unavailable, never as a deny', async () => {
    const principal = freshPrincipal();
    idp.grantPermission(principal, ORG, 'posts:write');
    const { auth, throttled } = throttledClient('0');

    const failure = await auth.check({ action: 'posts:write', organisationId: ORG, principal }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'PDP_UNAVAILABLE', status: 503, data: { retryAfterSeconds: 0 } });
    expect(throttled()).toBe(2);
  });

  it('should not hold the request for a retry-after longer than its budget, and carry the hint instead', async () => {
    const { auth, throttled } = throttledClient('30');

    const failure = await auth.check({ action: 'posts:write', organisationId: ORG, principal: freshPrincipal() }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'PDP_UNAVAILABLE', status: 503, data: { retryAfterSeconds: 30 } });
    expect(throttled()).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('should answer a throttle without a retry-after as unavailable at once, since a blind retry lands in the same window', async () => {
    const { auth, throttled } = throttledClient(undefined);

    const failure = await auth.check({ action: 'posts:write', organisationId: ORG, principal: freshPrincipal() }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'PDP_UNAVAILABLE', status: 503 });
    expect(throttled()).toBe(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('should still honour fail-open on a throttled check', async () => {
    const { auth } = throttledClient('30');
    expect(await auth.check({ action: 'posts:write', organisationId: ORG, principal: freshPrincipal() }, { failOpen: true })).toBe(true);
  });
});
