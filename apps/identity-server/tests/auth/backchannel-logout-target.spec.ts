import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { AppError } from '@shadow-library/common';
import { setConfig } from '@shadow-library/common/testing';
import { FakeDatabaseService } from '@shadow-library/modules/testing';

import { AppErrorCode } from '@server/classes';
import { OAuthClientService } from '@server/modules/auth/oauth/oauth-client.service';
import { BackChannelLogoutService } from '@server/modules/auth/token/backchannel-logout.service';
import { WebhookTargetGuard } from '@server/modules/infrastructure/webhook/webhook-target.guard';

const PUBLIC_ADDRESS = '203.0.113.10';
const RESOLVED: Record<string, string> = { 'rp.example.com': PUBLIC_ADDRESS, 'rebound.example.com': '169.254.169.254' };

/** Every call returns the chain itself, and awaiting it yields `rows`: enough of a Drizzle builder for the statements under test. */
function chain(rows: unknown[] = []): unknown {
  const proxy: unknown = new Proxy(() => undefined, {
    get: (_target, property) => (property === 'then' ? (resolve: (value: unknown) => void) => resolve(rows) : () => proxy),
    apply: () => proxy,
  });
  return proxy;
}

function targetGuard(): WebhookTargetGuard {
  const guard = new WebhookTargetGuard();
  guard.allowInsecureTargets = false;
  guard.lookupAddresses = hostname => Promise.resolve(RESOLVED[hostname] ? [{ address: RESOLVED[hostname] }] : []);
  return guard;
}

function logoutServiceDelivering(logoutUri: string) {
  const delivery = { id: 'delivery-1', clientId: 'rp', logoutUri, subject: '42', sid: '7', attemptCount: 0 };
  const statuses: unknown[] = [];
  const postgres = {
    transaction: (work: (tx: unknown) => Promise<unknown>) => work({ select: () => chain([delivery]), update: () => chain() }),
    update: () => ({ set: (values: { status?: unknown }) => (statuses.push(values.status), chain()) }),
  };
  const service = new BackChannelLogoutService(new FakeDatabaseService({ postgres }), { sign: () => ({ token: 'logout-token' }) } as never, targetGuard());
  return { service, statuses };
}

async function refusal(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => null,
    (error: unknown) => error,
  );
}

describe('back-channel logout targets', () => {
  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;

  beforeEach(() => {
    setConfig({ 'webhooks.allow-insecure-targets': false, 'oauth.issuer': 'https://identity.example.com' });
    fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((() => Promise.resolve(new Response(null, { status: 200 }))) as unknown as typeof fetch);
  });

  afterEach(() => fetchSpy.mockRestore());

  it('should never post a logout token to a private or loopback address', async () => {
    for (const uri of ['https://169.254.169.254/latest', 'http://rp.example.com/logout', 'https://localhost/logout', 'https://rebound.example.com/logout']) {
      const { service, statuses } = logoutServiceDelivering(uri);
      expect(await service.dispatchPending()).toBe(0);
      expect(statuses).toEqual(['FAILED']);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should refuse to follow a redirect away from the validated target', async () => {
    fetchSpy.mockImplementation((() => Promise.resolve(new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/' } }))) as unknown as typeof fetch);
    const { service, statuses } = logoutServiceDelivering('https://rp.example.com/logout');

    expect(await service.dispatchPending()).toBe(0);
    expect(statuses).toEqual(['FAILED']);
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });

  it('should deliver to a public https endpoint', async () => {
    const { service, statuses } = logoutServiceDelivering('https://rp.example.com/logout');

    expect(await service.dispatchPending()).toBe(1);
    expect(statuses).toEqual(['SENT']);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe('https://rp.example.com/logout');
  });

  it('should refuse to register or update a client with a logout uri it would never deliver to', async () => {
    const tx = { $count: () => Promise.resolve(0), insert: () => ({ values: () => Promise.resolve() }), update: () => chain(), delete: () => chain() };
    const postgres = { transaction: (work: (handle: unknown) => Promise<unknown>) => work(tx), select: () => chain() };
    const service = new OAuthClientService(new FakeDatabaseService({ postgres }), targetGuard());
    const register = (backchannelLogoutUri: string): Promise<unknown> =>
      service.register({ applicationId: 1, name: 'rp', kind: 'SPA_PUBLIC', grantTypes: ['authorization_code'], backchannelLogoutUri });

    expect(AppError.is(await refusal(register('http://10.0.0.8/logout')), AppErrorCode.ADM_003)).toBe(true);
    expect(AppError.is(await refusal(register('not a url')), AppErrorCode.ADM_003)).toBe(true);
    expect(AppError.is(await refusal(service.updateClient('rp', { backchannelLogoutUri: 'https://127.0.0.1/logout' })), AppErrorCode.ADM_003)).toBe(true);

    expect(await register('https://rp.example.com/logout')).toMatchObject({ secret: undefined });
    expect(await service.updateClient('rp', { backchannelLogoutUri: null })).toBeUndefined();
  });
});
