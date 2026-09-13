import { describe, expect, it } from 'bun:test';

import { type HandlerMetadata } from '@shadow-library/app';
import { type AuthPrincipal } from '@shadow-library/auth';
import { AUTH_PRINCIPAL, AUTH_ROUTE_METADATA, extendContextWithAuth } from '@shadow-library/auth/module';
import { AppError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { AUTH_ROUTES_BASE_PATH, PUBLIC_ROUTE_METADATA, RouteGuardSentinel } from '@modules/auth';
import { AppErrorCode } from '@server/classes';

/**
 * The sentinel is pulse's default-deny layer over the SDK's opt-in guard. It must let three kinds of
 * route through — SDK-guarded (`AUTH_ROUTE_METADATA`), explicitly `@Public()`, and the SDK's own
 * first-party auth routes under `AUTH_ROUTES_BASE_PATH` — and fail every undeclared route closed.
 * Pulse exposes nothing to bots, so a bot principal is refused on every guarded route as well.
 */
const context = new ContextService();
extendContextWithAuth(context);
const sentinel = new RouteGuardSentinel(context);

const USER: AuthPrincipal = { kind: 'user', sub: 'user-1', scopes: [], claims: {} };
const BOT: AuthPrincipal = { kind: 'bot', sub: 'bot_42', clientId: 'bot_42', scopes: [], org: '7', botId: '42', keyId: 'key-1', rateLimitPerMinute: 60, claims: {} };

function runAs(principal: AuthPrincipal, handler: () => Promise<void>): Promise<unknown> {
  return new Promise(resolve => {
    const hook = context.init() as unknown as (request: unknown, response: unknown, done: () => void) => void;
    hook({ id: 'sentinel-rid' }, {}, () => {
      context.set(AUTH_PRINCIPAL, principal);
      handler().then(() => resolve(undefined), resolve);
    });
  });
}

const metadata = (path: string, extra: Record<string | symbol, unknown> = {}): HandlerMetadata => ({ path, ...extra });

describe('RouteGuardSentinel', () => {
  it('should let a non-bot principal through a route that carries the shared auth metadata', async () => {
    const handler = sentinel.generate(metadata('/api/v1/templates', { [AUTH_ROUTE_METADATA]: { authenticated: true } }));

    expect(handler).toBeDefined();
    expect(await runAs(USER, handler as () => Promise<void>)).toBeUndefined();
  });

  it('should refuse a bot principal on a guarded route, even one declaring a bot permission', async () => {
    for (const auth of [{ authenticated: true }, { authenticated: true, botPermissions: ['pulse:notifications:send'] }]) {
      const handler = sentinel.generate(metadata('/api/v1/notifications', { [AUTH_ROUTE_METADATA]: auth }));
      expect(AppError.is(await runAs(BOT, handler as () => Promise<void>), AppErrorCode.SEC_003)).toBe(true);
    }
  });

  it('should not guard a route explicitly marked public', () => {
    const handler = sentinel.generate(metadata('/api/v1/public-thing', { [PUBLIC_ROUTE_METADATA]: true }));

    expect(handler).toBeUndefined();
  });

  it('should treat the SDK first-party auth routes as declared-public', () => {
    for (const path of ['/login', '/callback', '/session', '/logout', '/step-up']) {
      expect(sentinel.generate(metadata(`${AUTH_ROUTES_BASE_PATH}${path}`))).toBeUndefined();
    }
  });

  it('should default-deny a route that declares no access policy', async () => {
    const handler = sentinel.generate(metadata('/api/v1/undeclared'));
    expect(handler).toBeDefined();

    let thrown: unknown;
    await (handler as () => Promise<void>)().catch((error: unknown) => (thrown = error));
    expect(AppError.is(thrown, AppErrorCode.SEC_003)).toBe(true);
  });
});
