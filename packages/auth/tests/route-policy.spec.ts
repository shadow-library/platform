/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import 'reflect-metadata';
import { type Response as MockResponse } from 'light-my-request';
import { Dispatcher, type HandlerMetadata, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { FastifyModule, Get, HttpController, HttpMethod } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AuthErrorCode } from '@shadow-library/auth';
import {
  AuthAccessPolicy,
  Authenticated,
  AuthModule,
  type AuthRouteMetadata,
  BotPermission,
  OptionalAuth,
  Public,
  RequireScope,
  resolveRoutePolicy,
} from '@shadow-library/auth/module';
import { createTestIdP, type TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

interface MockRouter {
  mockRequest(options: { method: string; url: string; headers?: Record<string, string> }): Promise<MockResponse>;
}

/**
 * Declaring the constants
 */
const CLIENT = { id: 'svc-reports', secret: 's3cr3t' };
const AUDIENCE = 'api://reports';

const route = (auth?: Record<string, unknown>): HandlerMetadata => ({ method: HttpMethod.GET, path: '/reports', ...(auth && { shadowAuth: auth }) });

const configError = (run: () => unknown): AppError => {
  try {
    run();
  } catch (error) {
    if (AppError.is(error, AuthErrorCode.CONFIG_INVALID)) return error;
    throw error;
  }
  throw new Error('expected CONFIG_INVALID');
};

describe('access decorators', () => {
  const metadataOf = (target: object): unknown => {
    for (const key of Reflect.getMetadataKeys(target)) {
      const value = Reflect.getMetadata(key, target) as Record<string, unknown> | undefined;
      if (value && typeof value === 'object' && 'shadowAuth' in value) return value.shadowAuth;
    }
    return undefined;
  };

  it('should write public and optional access onto the route', () => {
    class Controller {
      @Public()
      health(): void {}

      @OptionalAuth()
      catalog(): void {}
    }

    expect(metadataOf(Controller.prototype.health)).toEqual({ access: 'public' });
    expect(metadataOf(Controller.prototype.catalog)).toEqual({ access: 'optional' });
  });

  it('should let several requiring decorators share one method', () => {
    class Controller {
      @RequireScope('reports:read')
      @BotPermission('reports:read')
      list(): void {}
    }

    expect(metadataOf(Controller.prototype.list)).toEqual({ access: 'required', scopes: ['reports:read'], botPermissions: ['reports:read'] });
  });

  it('should refuse two different accesses on one method rather than let source order pick', () => {
    const error = configError(() => {
      class Controller {
        @Public()
        @Authenticated()
        list(): void {}
      }
      return Controller;
    });

    expect(error.message).toContain("'list' is declared both 'required' and 'public'");
  });

  it('should refuse two different accesses on one class', () => {
    const error = configError(() => {
      @OptionalAuth()
      @Public()
      class Controller {}
      return Controller;
    });

    expect(error.message).toContain("'Controller' is declared both 'public' and 'optional'");
  });
});

describe('resolveRoutePolicy', () => {
  const MATRIX: [string, HandlerMetadata, AuthRouteMetadata, AuthRouteMetadata][] = [
    ['an undecorated route', route(), { access: 'public' }, { access: 'required' }],
    ['a public route', route({ access: 'public' }), { access: 'public' }, { access: 'public' }],
    ['an optional route', route({ access: 'optional' }), { access: 'optional' }, { access: 'required' }],
    ['a plain required route', route({ access: 'required' }), { access: 'required' }, { access: 'required' }],
    ['a scoped route', route({ access: 'required', scopes: ['reports:read'] }), { access: 'required', scopes: ['reports:read'] }, { access: 'required', scopes: ['reports:read'] }],
  ];

  for (const [name, metadata, inPublic, inPrivate] of MATRIX) {
    it(`should resolve ${name} for each access mode`, () => {
      expect(resolveRoutePolicy(metadata, 'public')).toEqual(inPublic);
      expect(resolveRoutePolicy(metadata, 'private')).toEqual(inPrivate);
    });
  }

  it('should refuse a public or optional route that also carries a requirement, in either mode', () => {
    const contradictions = [
      { access: 'public', scopes: ['reports:admin'] },
      { access: 'public', permission: 'reports:write' },
      { access: 'optional', elevated: true },
      { access: 'optional', botPermissions: ['reports:read'] },
    ];

    for (const auth of contradictions) {
      for (const mode of ['public', 'private'] as const) {
        const error = configError(() => resolveRoutePolicy(route(auth), mode));
        expect(error.message).toContain(`GET /reports is declared '${auth.access}'`);
      }
    }
  });

  it('should refuse metadata that names no known access, such as the pre-access shape', () => {
    const error = configError(() => resolveRoutePolicy(route({ authenticated: true }), 'public'));
    expect(error.message).toContain("unknown access 'undefined'");
  });

  it('should expose the same resolution through the injectable policy', () => {
    const policy = new AuthAccessPolicy('private');

    expect(policy.mode).toBe('private');
    expect(policy.isPrivate()).toBe(true);
    expect(new AuthAccessPolicy('public').isPrivate()).toBe(false);
    expect(policy.resolve(route({ access: 'optional' }))).toEqual({ access: 'required' });
  });
});

describe('route policy across class and method', () => {
  @Authenticated()
  @HttpController('/members')
  class MemberController {
    @Get()
    list(): { ok: boolean } {
      return { ok: true };
    }

    @Public()
    @Get('/directory')
    directory(): { ok: boolean } {
      return { ok: true };
    }

    @OptionalAuth()
    @Get('/feed')
    feed(): { ok: boolean } {
      return { ok: true };
    }
  }

  @HttpController('/open')
  class OpenController {
    @Get()
    index(): { ok: boolean } {
      return { ok: true };
    }

    @Public()
    @Get('/health')
    health(): { ok: boolean } {
      return { ok: true };
    }
  }

  @RequireScope('reports:read')
  @HttpController('/reports')
  class ReportController {
    @RequireScope('reports:write')
    @Get('/drafts')
    drafts(): { ok: boolean } {
      return { ok: true };
    }
  }

  @Module({ imports: [FastifyModule], controllers: [MemberController, OpenController, ReportController] })
  class RoutesModule {}

  let idp: TestIdP;
  let app: ShadowApplication;
  let router: MockRouter;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret, app: { audience: AUDIENCE } });
    const auth = AuthModule.forRoot({ issuer: idp.issuer, audience: AUDIENCE, appId: CLIENT.id, client: CLIENT, defaultAccessMode: 'private' });

    @Module({ imports: [FastifyModule.forRoot({ imports: [auth, RoutesModule] })] })
    class TestAppModule {}

    app = await ShadowFactory.create(TestAppModule);
    router = app.get(Dispatcher) as unknown as MockRouter;
  });

  afterAll(async () => {
    await app.stop();
    idp.stop();
  });

  const get = async (url: string, scopes?: string[]): Promise<number> => {
    const headers: Record<string, string> = scopes ? { authorization: `Bearer ${await idp.issueToken({ sub: 'user-42', audience: AUDIENCE, scopes })}` } : {};
    const response = await router.mockRequest({ method: 'GET', url, headers });
    return response.statusCode;
  };

  it('should let a method-level @Public() open one route of an @Authenticated() class', async () => {
    expect(await get('/members/directory')).toBe(200);
    expect(await get('/members')).toBe(401);
  });

  it('should require a session on an optional route in a private application', async () => {
    expect(await get('/members/feed')).toBe(401);
    expect(await get('/members/feed', [])).toBe(200);
  });

  it('should require a session on an undecorated route in a private application', async () => {
    expect(await get('/open')).toBe(401);
    expect(await get('/open', [])).toBe(200);
    expect(await get('/open/health')).toBe(200);
  });

  it('should accumulate class- and method-level scopes', async () => {
    expect(await get('/reports/drafts', ['reports:read'])).toBe(403);
    expect(await get('/reports/drafts', ['reports:read', 'reports:write'])).toBe(200);
  });

  it('should keep the SDK sign-in surface reachable without a session', async () => {
    const access = await router.mockRequest({ method: 'GET', url: '/auth/access' });
    expect(access.statusCode).toBe(200);
    expect(JSON.parse(access.payload)).toEqual({ mode: 'private' });

    expect(await get('/auth/login')).toBe(302);
    expect(await get('/auth/session')).toBe(401);
  });
});

describe('route registration with contradictory metadata', () => {
  it('should fail the boot instead of serving the route either way', async () => {
    @RequireScope('reports:admin')
    @HttpController('/admin')
    class AdminController {
      @Public()
      @Get('/status')
      status(): { ok: boolean } {
        return { ok: true };
      }
    }

    @Module({ imports: [FastifyModule], controllers: [AdminController] })
    class AdminModule {}

    const idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret, app: { audience: AUDIENCE } });
    const auth = AuthModule.forRoot({ issuer: idp.issuer, audience: AUDIENCE, appId: CLIENT.id, client: CLIENT });
    @Module({ imports: [FastifyModule.forRoot({ imports: [auth, AdminModule] })] })
    class TestAppModule {}

    const failure = await ShadowFactory.create(TestAppModule).catch((error: unknown) => error);
    idp.stop();

    expect(AppError.is(failure, AuthErrorCode.CONFIG_INVALID)).toBe(true);
    expect((failure as AppError).message).toContain("GET /admin/status is declared 'public' but also requires scopes");
  });
});
