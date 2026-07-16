/**
 * Importing npm packages
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import 'reflect-metadata';

/**
 * Importing user defined packages
 */
import { type RouteMetadata } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

import { AuthClient } from '@shadow-library/auth';
import { AuthGuard, AuthModule, Authenticated, GuardedRequest, RequirePermission, RequireScope, extendContextWithAuth } from '@shadow-library/auth/module';
import { TestIdP, createTestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

type RouteMetadataRecord = Record<string, unknown>;

/**
 * Declaring the constants
 */
const AUDIENCE = 'api://pulse';
const ORG = '7';

/** Reads back the metadata the decorators wrote through the framework `Route` decorator */
const getRouteMetadata = (target: object): RouteMetadataRecord => {
  for (const key of Reflect.getMetadataKeys(target)) {
    const value = Reflect.getMetadata(key, target) as RouteMetadataRecord | undefined;
    if (value && typeof value === 'object' && 'shadowAuth' in value) return value.shadowAuth as RouteMetadataRecord;
  }
  throw new Error('no auth route metadata found');
};

describe('auth decorators', () => {
  class Controller {
    @Authenticated()
    plain(): string {
      return 'plain';
    }

    @RequireScope('posts:admin', 'posts:write')
    scoped(): string {
      return 'scoped';
    }

    @RequirePermission('posts:write', { failOpen: true })
    guarded(): string {
      return 'guarded';
    }
  }

  it('should write auth metadata onto the route', () => {
    expect(getRouteMetadata(Controller.prototype.plain)).toEqual({ authenticated: true });
    expect(getRouteMetadata(Controller.prototype.scoped)).toEqual({ authenticated: true, scopes: ['posts:admin', 'posts:write'] });
    expect(getRouteMetadata(Controller.prototype.guarded)).toEqual({ authenticated: true, permission: 'posts:write', failOpen: true });
  });
});

describe('AuthGuard', () => {
  let idp: TestIdP;
  let auth: AuthClient;
  let guard: AuthGuard;
  let context: ContextService;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: 'svc-pulse', clientSecret: 's3cr3t' });
    auth = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: { id: 'svc-pulse', secret: 's3cr3t' } });
    context = new ContextService();
    extendContextWithAuth(context);
    guard = new AuthGuard(auth, context);
  });
  afterAll(() => idp.stop());

  const request = (token?: string): GuardedRequest => ({ headers: token ? { authorization: `Bearer ${token}` } : {} });

  /** Runs the generated handler inside a fresh request context, mirroring the fastify onRequest hook */
  const runInContext = (rid: string, run: () => void): void => {
    const hook = context.init() as unknown as (request: unknown, response: unknown, done: () => void) => void;
    hook({ id: rid }, {}, run);
  };

  const runGuarded = (handler: (request: GuardedRequest) => Promise<void>, req: GuardedRequest, after?: () => void): Promise<void> =>
    new Promise((resolve, reject) => {
      runInContext('test-rid', () => {
        handler(req)
          .then(() => after?.())
          .then(resolve, reject);
      });
    });

  const expectStatus = async (handler: (request: GuardedRequest) => Promise<void>, req: GuardedRequest, statusCode: number) => {
    const error = await runGuarded(handler, req).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(statusCode);
  };

  const generate = (metadata: RouteMetadata): ((request: GuardedRequest) => Promise<void>) => {
    const handler = guard.generate(metadata);
    if (!handler) throw new Error('expected a handler');
    return handler;
  };

  it('should not attach to routes without auth metadata', () => {
    expect(guard.generate({})).toBeUndefined();
  });

  it('should reject missing, malformed, and invalid tokens with 401', async () => {
    const handler = generate({ shadowAuth: { authenticated: true } });
    await expectStatus(handler, request(), 401);
    await expectStatus(handler, { headers: { authorization: 'Basic abc' } }, 401);
    await expectStatus(handler, request('garbage'), 401);
    await expectStatus(handler, request(await idp.issueToken({ sub: '42', audience: 'api://other' })), 401);
  });

  it('should expose the principal through the context for a valid token', async () => {
    const handler = generate({ shadowAuth: { authenticated: true } });
    const req = request(await idp.issueToken({ sub: '42', audience: AUDIENCE, org: ORG }));
    await runGuarded(handler, req, () => {
      expect(context.getAuthPrincipal()).toMatchObject({ kind: 'user', sub: '42', org: ORG });
      expect(context.getAuthPrincipalOrNull()).not.toBeNull();
    });
  });

  it('should enforce required scopes with 403', async () => {
    const handler = generate({ shadowAuth: { authenticated: true, scopes: ['posts:admin'] } });
    await expectStatus(handler, request(await idp.issueToken({ sub: '42', audience: AUDIENCE, scopes: ['posts:read'] })), 403);
    await runGuarded(handler, request(await idp.issueToken({ sub: '42', audience: AUDIENCE, scopes: ['posts:admin', 'posts:read'] })));
  });

  it('should deny service callers until identity-configured access rules allow them', async () => {
    const metadata: RouteMetadata = { shadowAuth: { authenticated: true }, method: 'POST' as never, path: '/api/v1/index' };
    const handler = generate(metadata);
    const serviceRequest = async () => request(await idp.issueToken({ sub: 'svc-indexer', kind: 'service', clientId: 'svc-indexer', audience: AUDIENCE }));

    await expectStatus(handler, await serviceRequest(), 403);

    idp.setServiceAccess([{ callerClientId: 'svc-indexer', method: 'POST', path: '/api/v1/index' }]);
    await auth.loadServiceAccess();
    await runGuarded(handler, await serviceRequest(), () => {
      expect(context.getAuthPrincipal().clientId).toBe('svc-indexer');
    });

    /** A rule for another route or caller must not leak access */
    await expectStatus(generate({ shadowAuth: { authenticated: true }, method: 'DELETE' as never, path: '/api/v1/index' }), await serviceRequest(), 403);
    await expectStatus(handler, request(await idp.issueToken({ sub: 'svc-other', kind: 'service', clientId: 'svc-other', audience: AUDIENCE })), 403);
  });

  it('should match wildcard method and path rules', async () => {
    idp.setServiceAccess([{ callerClientId: 'svc-batch', method: '*', path: '/api/v1/jobs/*' }]);
    await auth.loadServiceAccess();
    expect(auth.isServiceCallerAllowed('svc-batch', 'GET', '/api/v1/jobs/42')).toBe(true);
    expect(auth.isServiceCallerAllowed('svc-batch', 'DELETE', '/api/v1/jobs')).toBe(false);
    expect(auth.isServiceCallerAllowed('svc-other', 'GET', '/api/v1/jobs/42')).toBe(false);
  });

  it('should enforce pdp permissions in the principal organisation', async () => {
    const handler = generate({ shadowAuth: { authenticated: true, permission: 'posts:write' } });
    const denied = request(await idp.issueToken({ sub: 'writer', audience: AUDIENCE, org: ORG }));
    await expectStatus(handler, denied, 403);

    idp.grantPermission({ kind: 'user', sub: 'writer-2' }, ORG, 'posts:write');
    const granted = request(await idp.issueToken({ sub: 'writer-2', audience: AUDIENCE, org: ORG }));
    await runGuarded(handler, granted, () => {
      expect(context.getAuthPrincipal().sub).toBe('writer-2');
    });
  });

  it('should deny permission routes for tokens without an organisation', async () => {
    const handler = generate({ shadowAuth: { authenticated: true, permission: 'posts:write' } });
    await expectStatus(handler, request(await idp.issueToken({ sub: '42', audience: AUDIENCE })), 403);
  });

  it('should throw 401 from getAuthPrincipal when the guard never ran', async () => {
    await new Promise<void>((resolve, reject) => {
      runInContext('bare-rid', () => {
        try {
          expect(() => context.getAuthPrincipal()).toThrow();
          expect(context.getAuthPrincipalOrNull()).toBeNull();
          resolve();
        } catch (error) {
          reject(error as Error);
        }
      });
    });
  });

  it('should provide the auth client under its class token through the dynamic module', () => {
    const dynamicModule = AuthModule.forRoot({ issuer: idp.issuer, audience: AUDIENCE });
    expect(dynamicModule.controllers).toContain(AuthGuard);
    const provider = (dynamicModule.providers ?? []).find(entry => typeof entry === 'object' && 'token' in entry && entry.token === AuthClient);
    expect(provider).toBeDefined();
    expect(dynamicModule.exports).toContain(AuthClient);
  });
});
