/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import 'reflect-metadata';

/**
 * Importing user defined packages
 */
import { ServerError } from '@shadow-library/fastify';

import { AuthClient, createAuthClient } from '@shadow-library/auth';
import { AllowService, AuthGuard, AuthModule, Authenticated, GuardedRequest, RequirePermission, RequireScope, getPrincipal } from '@shadow-library/auth/module';
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

    @AllowService('svc-indexer')
    serviceOnly(): string {
      return 'service-only';
    }

    @RequirePermission('posts:write', { failOpen: true })
    guarded(): string {
      return 'guarded';
    }
  }

  it('should write auth metadata onto the route', () => {
    expect(getRouteMetadata(Controller.prototype.plain)).toEqual({ authenticated: true });
    expect(getRouteMetadata(Controller.prototype.scoped)).toEqual({ authenticated: true, scopes: ['posts:admin', 'posts:write'] });
    expect(getRouteMetadata(Controller.prototype.serviceOnly)).toEqual({ authenticated: true, services: ['svc-indexer'] });
    expect(getRouteMetadata(Controller.prototype.guarded)).toEqual({ authenticated: true, permission: 'posts:write', failOpen: true });
  });
});

describe('AuthGuard', () => {
  let idp: TestIdP;
  let auth: AuthClient;
  let guard: AuthGuard;

  beforeAll(async () => {
    idp = await createTestIdP();
    auth = createAuthClient({ issuer: idp.issuer, audience: AUDIENCE });
    guard = new AuthGuard(auth);
  });
  afterAll(() => idp.stop());

  const request = (token?: string): GuardedRequest => ({ headers: token ? { authorization: `Bearer ${token}` } : {} });
  const expectStatus = async (handler: (request: GuardedRequest) => Promise<void>, req: GuardedRequest, statusCode: number) => {
    const error = await handler(req).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ServerError);
    expect((error as ServerError).getStatusCode()).toBe(statusCode);
  };

  it('should not attach to routes without auth metadata', () => {
    expect(guard.generate({})).toBeUndefined();
  });

  it('should reject missing, malformed, and invalid tokens with 401', async () => {
    const handler = guard.generate({ shadowAuth: { authenticated: true } });
    if (!handler) throw new Error('expected a handler');
    await expectStatus(handler, request(), 401);
    await expectStatus(handler, { headers: { authorization: 'Basic abc' } }, 401);
    await expectStatus(handler, request('garbage'), 401);
    await expectStatus(handler, request(await idp.issueToken({ sub: '42', audience: 'api://other' })), 401);
  });

  it('should attach the principal for a valid token', async () => {
    const handler = guard.generate({ shadowAuth: { authenticated: true } });
    if (!handler) throw new Error('expected a handler');
    const req = request(await idp.issueToken({ sub: '42', audience: AUDIENCE, org: ORG }));
    await handler(req);
    expect(getPrincipal(req)).toMatchObject({ kind: 'user', sub: '42', org: ORG });
  });

  it('should enforce required scopes with 403', async () => {
    const handler = guard.generate({ shadowAuth: { authenticated: true, scopes: ['posts:admin'] } });
    if (!handler) throw new Error('expected a handler');
    await expectStatus(handler, request(await idp.issueToken({ sub: '42', audience: AUDIENCE, scopes: ['posts:read'] })), 403);
    await handler(request(await idp.issueToken({ sub: '42', audience: AUDIENCE, scopes: ['posts:admin', 'posts:read'] })));
  });

  it('should restrict service-only routes to allowlisted clients', async () => {
    const handler = guard.generate({ shadowAuth: { authenticated: true, services: ['svc-indexer'] } });
    if (!handler) throw new Error('expected a handler');
    await expectStatus(handler, request(await idp.issueToken({ sub: '42', audience: AUDIENCE })), 403);
    await expectStatus(handler, request(await idp.issueToken({ sub: 'svc-other', kind: 'service', clientId: 'svc-other', audience: AUDIENCE })), 403);
    await handler(request(await idp.issueToken({ sub: 'svc-indexer', kind: 'service', clientId: 'svc-indexer', audience: AUDIENCE })));
  });

  it('should enforce pdp permissions in the principal organisation', async () => {
    const handler = guard.generate({ shadowAuth: { authenticated: true, permission: 'posts:write' } });
    if (!handler) throw new Error('expected a handler');
    const denied = request(await idp.issueToken({ sub: 'writer', audience: AUDIENCE, org: ORG }));
    await expectStatus(handler, denied, 403);

    idp.grantPermission({ kind: 'user', sub: 'writer' }, ORG, 'posts:write');
    idp.bumpAuthzVersion();
    const granted = request(await idp.issueToken({ sub: 'writer-2', audience: AUDIENCE, org: ORG }));
    idp.grantPermission({ kind: 'user', sub: 'writer-2' }, ORG, 'posts:write');
    await handler(granted);
    expect(getPrincipal(granted).sub).toBe('writer-2');
  });

  it('should deny permission routes for tokens without an organisation', async () => {
    const handler = guard.generate({ shadowAuth: { authenticated: true, permission: 'posts:write' } });
    if (!handler) throw new Error('expected a handler');
    await expectStatus(handler, request(await idp.issueToken({ sub: '42', audience: AUDIENCE })), 403);
  });

  it('should throw 401 from getPrincipal when the guard never ran', () => {
    expect(() => getPrincipal({})).toThrow();
  });

  it('should expose the auth client through the dynamic module', () => {
    const dynamicModule = AuthModule.forRoot({ issuer: idp.issuer, audience: AUDIENCE });
    expect(dynamicModule.controllers).toContain(AuthGuard);
    const provider = (dynamicModule.providers ?? []).find(entry => typeof entry === 'object' && 'useValue' in entry);
    expect(provider).toBeDefined();
  });
});
