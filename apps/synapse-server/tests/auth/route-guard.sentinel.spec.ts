import { describe, expect, it } from 'bun:test';

import { type HandlerMetadata } from '@shadow-library/app';
import { type AuthPrincipal } from '@shadow-library/auth';
import { AUTH_PRINCIPAL, AUTH_ROUTE_METADATA, extendContextWithAuth } from '@shadow-library/auth/module';
import { AppError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { AUTH_ROUTES_BASE_PATH } from '@modules/auth/auth.constants';
import { PUBLIC_ROUTE_METADATA } from '@modules/auth/public.decorator';
import { RouteGuardSentinel } from '@modules/auth/route-guard.sentinel';
import { AppErrorCode } from '@server/classes';

const context = new ContextService();
extendContextWithAuth(context);
const sentinel = new RouteGuardSentinel(context);

const USER: AuthPrincipal = { kind: 'user', sub: 'user-1', scopes: [], claims: {} };
const SERVICE: AuthPrincipal = { kind: 'service', sub: 'novel-forge', clientId: 'novel-forge', scopes: ['synapse:infer'], claims: {} };
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
  it('should let a user or service principal through a route the SDK guards', async () => {
    for (const access of ['required', 'optional']) {
      const handler = sentinel.generate(metadata('/api/v1/chat/completions', { [AUTH_ROUTE_METADATA]: { access } }));

      expect(handler).toBeDefined();
      for (const principal of [USER, SERVICE]) expect(await runAs(principal, handler as () => Promise<void>)).toBeUndefined();
    }
  });

  it('should refuse a bot principal on a guarded route, even one declaring a bot permission', async () => {
    for (const auth of [{ access: 'required' }, { access: 'required', botPermissions: ['synapse:catalog:read'] }]) {
      const handler = sentinel.generate(metadata('/api/v1/chat/completions', { [AUTH_ROUTE_METADATA]: auth }));
      expect(AppError.is(await runAs(BOT, handler as () => Promise<void>), AppErrorCode.SEC_003)).toBe(true);
    }
  });

  it('should not guard a route explicitly marked public', () => {
    const handler = sentinel.generate(metadata('/api/v1/public-thing', { [PUBLIC_ROUTE_METADATA]: true }));

    expect(handler).toBeUndefined();
  });

  it('should not guard a route the SDK declares public, as it does its own sign-in routes', () => {
    for (const path of ['/login', '/callback', '/session', '/logout', '/step-up', '/access']) {
      expect(sentinel.generate(metadata(`${AUTH_ROUTES_BASE_PATH}${path}`, { [AUTH_ROUTE_METADATA]: { access: 'public' } }))).toBeUndefined();
    }
  });

  it('should default-deny an undeclared route even under the SDK auth base path', () => {
    expect(sentinel.generate(metadata(`${AUTH_ROUTES_BASE_PATH}/undeclared`))).toBeDefined();
  });

  it('should default-deny a route that declares no access policy', async () => {
    const handler = sentinel.generate(metadata('/api/v1/undeclared'));
    expect(handler).toBeDefined();

    let thrown: unknown;
    await (handler as () => Promise<void>)().catch((error: unknown) => (thrown = error));
    expect(AppError.is(thrown, AppErrorCode.SEC_003)).toBe(true);
  });
});
