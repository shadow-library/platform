/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import 'reflect-metadata';
import { type HandlerMetadata } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { ContextService, HttpMethod } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { type AuthAccessMode, AuthClient, AuthErrorCode, type AuthPrincipal } from '@shadow-library/auth';
import {
  AppSessionService,
  AuthAccessPolicy,
  AuthGuard,
  extendContextWithAuth,
  type GuardedRequest,
  type GuardedResponse,
  resolveAuthRoutes,
  resolveBrowserAuthConfig,
} from '@shadow-library/auth/module';
import { createTestIdP, type TestIdP } from '@shadow-library/auth/testing';

/**
 * Declaring the constants
 */
const CLIENT = { id: 'svc-catalog', secret: 's3cr3t' };
const AUDIENCE = 'api://catalog';
const REDIRECT_URI = 'https://catalog.test/auth/callback';
const OPTIONAL: HandlerMetadata = { method: HttpMethod.GET, path: '/api/novels', shadowAuth: { access: 'optional' } };

describe('AuthGuard route policy', () => {
  let idp: TestIdP;
  let auth: AuthClient;
  let context: ContextService;
  let sessions: AppSessionService;
  let cookieName: string;
  let counter = 0;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret, app: { audience: AUDIENCE } });
    auth = new AuthClient({ issuer: idp.issuer, appId: CLIENT.id, client: CLIENT });
    context = new ContextService();
    extendContextWithAuth(context);
    const config = resolveBrowserAuthConfig({ issuer: idp.issuer, client: CLIENT }, resolveAuthRoutes(), { enabled: true, redirectUri: REDIRECT_URI });
    sessions = new AppSessionService(auth, config);
    cookieName = config.cookieName;
  });
  afterAll(() => {
    auth.stop();
    idp.stop();
  });

  const guard = (mode: AuthAccessMode): AuthGuard => new AuthGuard(auth, context, new AuthAccessPolicy(mode), sessions);

  /** Records every header the guard writes, so a test can prove it wrote none */
  const capture = (): { response: GuardedResponse; headers: Record<string, unknown> } => {
    const headers: Record<string, unknown> = {};
    return { headers, response: { header: (name, value) => (headers[name] = value), redirect: () => undefined } };
  };

  /** Runs the generated handler inside a fresh request context and reports the principal it left behind */
  const run = (metadata: HandlerMetadata, request: GuardedRequest, mode: AuthAccessMode = 'public', response?: GuardedResponse): Promise<AuthPrincipal | null> =>
    new Promise((resolve, reject) => {
      const hook = context.init() as unknown as (request: unknown, response: unknown, done: () => void) => void;
      hook({ id: `optional-rid-${++counter}` }, {}, () => {
        const handler = guard(mode).generate(metadata);
        if (!handler) return reject(new Error('expected a handler'));
        handler(request, response).then(() => resolve(context.getAuthPrincipalOrNull()), reject);
      });
    });

  const bearer = (token: string): GuardedRequest => ({ headers: { authorization: `Bearer ${token}` } });

  const sessionHandle = async (): Promise<string> => {
    const code = idp.createAuthorizationCode({ sub: `reader-${++counter}`, scopes: ['openid', 'profile'] });
    const session = await auth.appSessions.createSession({ code, codeVerifier: 'verifier', redirectUri: REDIRECT_URI });
    return session.sessionHandle;
  };

  describe('generate', () => {
    it('should attach nothing to a route that resolves public', () => {
      expect(guard('public').generate({})).toBeUndefined();
      expect(guard('public').generate({ shadowAuth: { access: 'public' } })).toBeUndefined();
      expect(guard('private').generate({ shadowAuth: { access: 'public' } })).toBeUndefined();
    });

    it('should guard an undecorated or optional route once the application is private', async () => {
      for (const metadata of [{ method: HttpMethod.GET, path: '/api/novels' }, OPTIONAL] as HandlerMetadata[]) {
        const failure = await run(metadata, { headers: {} }, 'private').catch((error: unknown) => error);
        expect(failure).toMatchObject({ code: 'IAM_001', status: 401 });
      }
    });

    it('should refuse contradictory metadata while routes register', async () => {
      const contradictory: HandlerMetadata = { method: HttpMethod.GET, path: '/api/novels', shadowAuth: { access: 'optional', scopes: ['novels:read'] } };
      const failure = await Promise.resolve()
        .then(() => guard('public').generate(contradictory))
        .catch((error: unknown) => error);
      expect(AppError.is(failure, AuthErrorCode.CONFIG_INVALID)).toBe(true);
    });
  });

  describe('optional route', () => {
    it('should serve a caller presenting nothing as anonymous', async () => {
      expect(await run(OPTIONAL, { headers: {} })).toBeNull();
    });

    it('should read a bad bearer token as anonymous instead of answering 401', async () => {
      expect(await run(OPTIONAL, bearer('garbage'))).toBeNull();
      expect(await run(OPTIONAL, bearer(await idp.issueToken({ sub: 'reader', audience: 'api://other' })))).toBeNull();
    });

    it('should never exchange a bot key, reading the bot as anonymous', async () => {
      const key = idp.issueBotKey({ botId: 'crawler', org: '7' });
      const exchanges = idp.getBotKeyExchangeCount();

      expect(await run(OPTIONAL, bearer(key))).toBeNull();
      expect(idp.getBotKeyExchangeCount()).toBe(exchanges);
    });

    it('should resolve a valid bearer token to its principal', async () => {
      const principal = await run(OPTIONAL, bearer(await idp.issueToken({ sub: 'reader', audience: AUDIENCE })));
      expect(principal).toMatchObject({ kind: 'user', sub: 'reader' });
    });

    it('should resolve a valid session cookie to its principal', async () => {
      const principal = await run(OPTIONAL, { headers: { cookie: `${cookieName}=${await sessionHandle()}` } });
      expect(principal).toMatchObject({ kind: 'user' });
    });

    it('should read a dead session cookie as anonymous without touching the response', async () => {
      const { response, headers } = capture();

      expect(await run(OPTIONAL, { url: '/api/novels', headers: { accept: 'text/html', cookie: `${cookieName}=revoked-handle` } }, 'public', response)).toBeNull();
      expect(headers).toEqual({});
    });

    it('should identify a service caller only where a service-access rule covers the route', async () => {
      const request = bearer(await idp.issueToken({ sub: 'svc-indexer', kind: 'service', clientId: 'svc-indexer', audience: AUDIENCE }));
      expect(await run(OPTIONAL, request)).toBeNull();

      idp.setServiceAccess([{ callerClientId: 'svc-indexer', method: 'GET', path: '/api/novels' }]);
      await auth.loadServiceAccess();
      expect(await run(OPTIONAL, request)).toMatchObject({ kind: 'service', clientId: 'svc-indexer' });
    });
  });
});
