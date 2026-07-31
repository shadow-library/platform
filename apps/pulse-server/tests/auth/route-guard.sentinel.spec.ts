/**
 * Importing npm packages
 */
import { describe, expect, it } from 'bun:test';

import { type HandlerMetadata } from '@shadow-library/app';
import { AUTH_ROUTE_METADATA } from '@shadow-library/auth/module';
import { AppError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AUTH_ROUTES_BASE_PATH, PUBLIC_ROUTE_METADATA, RouteGuardSentinel } from '@modules/auth';
import { AppErrorCode } from '@server/classes';

/**
 * Declaring the constants
 *
 * The sentinel is pulse's default-deny layer over the SDK's opt-in guard. It must let three kinds of
 * route through — SDK-guarded (`AUTH_ROUTE_METADATA`), explicitly `@Public()`, and the SDK's own
 * first-party auth routes under `AUTH_ROUTES_BASE_PATH` — and fail every undeclared route closed.
 */
const sentinel = new RouteGuardSentinel();

const metadata = (path: string, extra: Record<string | symbol, unknown> = {}): HandlerMetadata => ({ path, ...extra });

describe('RouteGuardSentinel', () => {
  it('should not guard a route that carries the shared auth metadata', () => {
    const handler = sentinel.generate(metadata('/api/v1/templates', { [AUTH_ROUTE_METADATA]: { authenticated: true } }));

    expect(handler).toBeUndefined();
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
