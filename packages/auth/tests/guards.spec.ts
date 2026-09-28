/**
 * Importing npm packages
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import 'reflect-metadata';

/**
 * Importing user defined packages
 */
import { type HandlerMetadata } from '@shadow-library/app';
import { AuthClient, type FetchLike } from '@shadow-library/auth';
import {
  AppSessionService,
  Authenticated,
  AuthGuard,
  AuthModule,
  extendContextWithAuth,
  GuardedRequest,
  GuardedResponse,
  RequirePermission,
  RequireScope,
  resolveAuthRoutes,
  resolveBrowserAuthConfig,
} from '@shadow-library/auth/module';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';
import { AppError } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';

/**
 * Defining types
 */

type RouteMetadataRecord = Record<string, unknown>;

/**
 * Declaring the constants
 */
const AUDIENCE = 'api://pulse';
const ORG = '7';

/** Reads back the metadata the decorators wrote through the framework `Handler` decorator */
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

  const runGuarded = (handler: (request: GuardedRequest) => Promise<unknown>, req: GuardedRequest, after?: () => void): Promise<void> =>
    new Promise((resolve, reject) => {
      runInContext('test-rid', () => {
        handler(req)
          .then(() => after?.())
          .then(resolve, reject);
      });
    });

  const expectStatus = async (handler: (request: GuardedRequest) => Promise<unknown>, req: GuardedRequest, statusCode: number) => {
    const error = await runGuarded(handler, req).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(statusCode);
  };

  const generate = (metadata: HandlerMetadata): ((request: GuardedRequest) => Promise<unknown>) => {
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
    const metadata: HandlerMetadata = { shadowAuth: { authenticated: true }, method: 'POST' as never, path: '/api/v1/index' };
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

  /**
   * `failOpen` means "the decision point was unreachable, prefer availability" — never "there was
   * nothing to ask, assume yes". Letting it cover a missing organisation would quietly unguard every
   * `failOpen` route for exactly the credentials least entitled to pass it.
   */
  it('should deny an organisation-less token on a fail-open permission route', async () => {
    const handler = generate({ shadowAuth: { authenticated: true, permission: 'posts:write', failOpen: true } });
    await expectStatus(handler, request(await idp.issueToken({ sub: 'orgless', audience: AUDIENCE })), 403);

    /** The same route does fail open once the token names an organisation — which is what the flag is actually for. */
    idp.setEndpointFailure('/api/v1/authz/check', true);
    const named = request(await idp.issueToken({ sub: 'named', audience: AUDIENCE, org: ORG }));
    await runGuarded(handler, named, () => {
      expect(context.getAuthPrincipal().sub).toBe('named');
    });
    idp.setEndpointFailure('/api/v1/authz/check', false);
  });

  describe('under an identity throttle', () => {
    const CLIENT = { id: 'svc-pulse', secret: 's3cr3t' };

    /** Answers every call to `pathname` the way identity's rate limiter does */
    const throttling =
      (pathname: string): FetchLike =>
      (url, init) =>
        new URL(url).pathname === pathname
          ? Promise.resolve(Response.json({ code: 'SEC_001', message: 'Too many requests' }, { status: 429, headers: { 'retry-after': '30' } }))
          : fetch(url, init);

    const capture = (): { response: GuardedResponse; headers: Record<string, string | string[]> } => {
      const headers: Record<string, string | string[]> = {};
      return { headers, response: { header: (name, value) => (headers[name] = value), redirect: () => undefined } };
    };

    it('should answer a throttled permission check with a retryable 503, not a 403', async () => {
      const throttled = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT, fetch: throttling('/api/v1/authz/check') });
      const handler = new AuthGuard(throttled, context).generate({ shadowAuth: { authenticated: true, permission: 'posts:write' } });
      idp.grantPermission({ kind: 'user', sub: 'entitled' }, ORG, 'posts:write');
      const { response, headers } = capture();

      const failure = await handler?.(request(await idp.issueToken({ sub: 'entitled', audience: AUDIENCE, org: ORG })), response).catch((error: unknown) => error);
      expect(failure).toMatchObject({ code: 'PDP_UNAVAILABLE', status: 503 });
      expect(headers['retry-after']).toBe('30');
      throttled.stop();
    });

    it('should answer a throttled session mint with a retryable 503, not a 401', async () => {
      const throttled = new AuthClient({ issuer: idp.issuer, audience: AUDIENCE, client: CLIENT, fetch: throttling('/api/v1/app-sessions/token') });
      const config = resolveBrowserAuthConfig({ issuer: idp.issuer, client: CLIENT }, resolveAuthRoutes(), { enabled: true, redirectUri: 'https://pulse.test/auth/callback' });
      const sessions = new AppSessionService(throttled, config);
      const handler = new AuthGuard(throttled, context, sessions).generate({ shadowAuth: { authenticated: true } });
      const { response, headers } = capture();

      const failure = await handler?.({ headers: { cookie: `${config.cookieName}=some-handle` } }, response).catch((error: unknown) => error);
      expect(failure).toMatchObject({ code: 'APP_SESSION_FAILED', status: 503 });
      expect(headers['retry-after']).toBe('30');
      expect(headers['set-cookie']).toBeUndefined();
      throttled.stop();
    });
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

describe('AuthGuard re-consent for a sensitive scope', () => {
  const CLIENT = { id: 'svc-memo', secret: 's3cr3t' };
  const SENSITIVE = 'memo:destroy';
  const NAVIGATION = { accept: 'text/html' };
  const ROUTE: HandlerMetadata = { shadowAuth: { authenticated: true, elevated: true, scopes: [SENSITIVE] }, method: 'POST' as never, path: '/deletion' };
  let idp: TestIdP;
  let auth: AuthClient;
  let context: ContextService;
  let sessions: AppSessionService;
  let counter = 0;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret, app: { audience: AUDIENCE, scopes: ['memo:read'], sensitiveScopes: [SENSITIVE] } });
    auth = new AuthClient({ issuer: idp.issuer, appId: CLIENT.id, client: CLIENT });
    context = new ContextService();
    extendContextWithAuth(context);
    sessions = new AppSessionService(
      auth,
      resolveBrowserAuthConfig({ issuer: idp.issuer, client: CLIENT }, resolveAuthRoutes(), { enabled: true, redirectUri: 'https://memo.test/auth/callback' }),
    );
  });
  afterAll(() => {
    auth.stop();
    idp.stop();
  });

  const config = () => resolveBrowserAuthConfig({ issuer: idp.issuer, client: CLIENT }, resolveAuthRoutes(), { enabled: true });
  const reconsentCookie = (): string => config().reconsentCookieName;

  /** A session whose grant was frozen from an authorization that did or did not consent to the sensitive scope, already stepped up */
  const elevatedSession = async (consented: boolean): Promise<string> => {
    const sub = `memo-user-${++counter}`;
    const scopes = ['openid', 'profile', 'memo:read', ...(consented ? [SENSITIVE] : [])];
    const code = idp.createAuthorizationCode({ sub, scopes });
    const session = await auth.appSessions.createSession({ code, codeVerifier: 'verifier', redirectUri: 'https://memo.test/auth/callback' });
    idp.setSteppedUp(sub, { clientId: CLIENT.id, resource: AUDIENCE });
    await sessions.claimElevation(session.sessionHandle);
    return session.sessionHandle;
  };

  const capture = (): { response: GuardedResponse; headers: Record<string, string[]>; redirectedTo: () => string | undefined } => {
    const headers: Record<string, string[]> = {};
    let location: string | undefined;
    const response: GuardedResponse = {
      header: (name, value) => (headers[name] = [...(headers[name] ?? []), ...(Array.isArray(value) ? value : [value])]),
      redirect: url => (location = url),
    };
    return { response, headers, redirectedTo: () => location };
  };

  const run = (request: GuardedRequest, response: GuardedResponse, metadata: HandlerMetadata = ROUTE): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const hook = context.init() as unknown as (request: unknown, response: unknown, done: () => void) => void;
      hook({ id: `rid-${counter}` }, {}, () => {
        const handler = new AuthGuard(auth, context, sessions).generate(metadata);
        if (!handler) return reject(new Error('expected a handler'));
        handler(request, response).then(resolve, reject);
      });
    });

  it('should send a session that predates the consent back through authorize, marking the attempt', async () => {
    const handle = await elevatedSession(false);
    const { response, headers, redirectedTo } = capture();

    await run({ url: '/deletion', headers: { ...NAVIGATION, cookie: `${config().cookieName}=${handle}` } }, response, { ...ROUTE, method: 'GET' as never });
    expect(redirectedTo()).toBe(`/auth/login?return_to=${encodeURIComponent('/deletion')}`);
    expect(headers['set-cookie']?.some(cookie => cookie.startsWith(`${config().cookieName}=;`))).toBe(true);
    expect(headers['set-cookie']?.some(cookie => cookie.startsWith(`${reconsentCookie()}=1;`))).toBe(true);
  });

  it('should answer an api caller with a 401 so its client restarts the login, marking the attempt', async () => {
    const handle = await elevatedSession(false);
    const { response, headers } = capture();

    const failure = await run({ url: '/deletion', headers: { cookie: `${config().cookieName}=${handle}` } }, response).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'IAM_001', status: 401 });
    expect(headers['set-cookie']?.some(cookie => cookie.startsWith(`${reconsentCookie()}=1;`))).toBe(true);
  });

  it('should answer a clear 403 rather than loop when the re-authorized session still lacks the scope', async () => {
    const handle = await elevatedSession(false);
    const { response, headers, redirectedTo } = capture();

    const cookie = `${config().cookieName}=${handle}; ${reconsentCookie()}=1`;
    const failure = await run({ url: '/deletion', headers: { ...NAVIGATION, cookie } }, response, { ...ROUTE, method: 'GET' as never }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'CONSENT_REQUIRED', status: 403 });
    expect(redirectedTo()).toBeUndefined();
    expect(headers['set-cookie']?.some(entry => entry.startsWith(`${reconsentCookie()}=;`))).toBe(true);
  });

  it('should admit a session that consented to the scope once it has stepped up', async () => {
    const handle = await elevatedSession(true);
    const { response } = capture();

    await expect(run({ url: '/deletion', headers: { cookie: `${config().cookieName}=${handle}` } }, response)).resolves.toBeUndefined();
  });

  it('should keep refusing a missing scope that is not sensitive with the generic 403', async () => {
    const handle = await elevatedSession(true);
    const { response, headers } = capture();

    const metadata: HandlerMetadata = { ...ROUTE, shadowAuth: { authenticated: true, elevated: true, scopes: ['memo:admin'] } };
    const failure = await run({ url: '/deletion', headers: { cookie: `${config().cookieName}=${handle}` } }, response, metadata).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'IAM_002', status: 403 });
    expect(headers['set-cookie']).toBeUndefined();
  });
});
