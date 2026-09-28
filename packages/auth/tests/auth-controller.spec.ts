/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import 'reflect-metadata';
import { type AppError } from '@shadow-library/common';
import { type ContextService } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AuthClient, type FetchLike } from '@shadow-library/auth';
import { AppSessionService, AuthController, resolveAuthRoutes, resolveBrowserAuthConfig } from '@shadow-library/auth/module';
import { createTestIdP, TestIdP } from '@shadow-library/auth/testing';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const CLIENT = { id: 'svc-reports', secret: 's3cr3t' };
const INJECTED = 'Your session expired, sign in again at https://evil.test';

describe('AuthController.callback', () => {
  let idp: TestIdP;
  let auth: AuthClient;
  let controller: AuthController;

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret });
    auth = new AuthClient({ issuer: idp.issuer, audience: 'api://reports', client: CLIENT });
    const config = resolveBrowserAuthConfig({ issuer: idp.issuer, client: CLIENT }, resolveAuthRoutes(), { enabled: true, redirectUri: 'https://reports.test/auth/callback' });
    controller = new AuthController(new AppSessionService(auth, config), {} as ContextService);
  });
  afterAll(() => {
    auth.stop();
    idp.stop();
  });

  const refusal = (query: Record<string, string>): Promise<AppError> =>
    controller.callback(query).then(
      () => expect.unreachable(),
      (error: AppError) => error,
    );

  it('should answer a declined authorization as forbidden without echoing the description', async () => {
    const error = await refusal({ error: 'access_denied', error_description: INJECTED });
    expect({ code: error.code, status: error.status }).toEqual({ code: 'AUTHORIZATION_DENIED', status: 403 });
    expect(JSON.stringify(error.toResponse())).not.toContain('evil.test');
  });

  it('should answer any other refusal as a bad request without echoing the description', async () => {
    for (const code of ['invalid_scope', 'invalid_request', 'made_up']) {
      const error = await refusal({ error: code, error_description: INJECTED });
      expect({ code: error.code, status: error.status }).toEqual({ code: 'AUTHORIZATION_REFUSED', status: 400 });
      expect(JSON.stringify(error.toResponse())).not.toContain('evil.test');
    }
  });

  it('should keep identity reporting its own trouble retryable', async () => {
    for (const code of ['server_error', 'temporarily_unavailable']) {
      const error = await refusal({ error: code, error_description: INJECTED });
      expect({ code: error.code, status: error.status }).toEqual({ code: 'EXCHANGE_FAILED', status: 503 });
      expect(JSON.stringify(error.toResponse())).not.toContain('evil.test');
    }
  });
});

describe('AuthController under an identity throttle', () => {
  const REDIRECT_URI = 'https://reports.test/auth/callback';
  let idp: TestIdP;
  let auth: AuthClient;
  let sessions: AppSessionService;
  let cookieName: string;

  /** Answers the app-session create and elevation calls the way identity's rate limiter does */
  const throttling: FetchLike = (url, init) =>
    ['/api/v1/app-sessions', '/api/v1/app-sessions/elevation'].includes(new URL(url).pathname)
      ? Promise.resolve(Response.json({ code: 'SEC_001', message: 'Too many requests' }, { status: 429, headers: { 'retry-after': '30' } }))
      : fetch(url, init);

  beforeAll(async () => {
    idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret });
    auth = new AuthClient({ issuer: idp.issuer, audience: 'api://reports', client: CLIENT, fetch: throttling });
    const config = resolveBrowserAuthConfig({ issuer: idp.issuer, client: CLIENT }, resolveAuthRoutes(), { enabled: true, redirectUri: REDIRECT_URI });
    cookieName = config.cookieName;
    sessions = new AppSessionService(auth, config);
  });
  afterAll(() => {
    auth.stop();
    idp.stop();
  });

  const controllerFor = (cookie: string): { controller: AuthController; headers: Record<string, string>; redirectedTo: () => string | undefined } => {
    const headers: Record<string, string> = {};
    let location: string | undefined;
    const response = { header: (name: string, value: string) => (headers[name] = value), redirect: (url: string) => (location = url) };
    const context = { getRequest: () => ({ headers: { cookie }, protocol: 'https', hostname: 'reports.test' }), getResponse: () => response } as unknown as ContextService;
    return { controller: new AuthController(sessions, context), headers, redirectedTo: () => location };
  };

  it('should carry retry-after on a callback whose session create was throttled', async () => {
    const started = await sessions.beginLogin('/reports');
    const state = new URL(started.url).searchParams.get('state') as string;
    const { controller, headers } = controllerFor((started.cookies[0] as string).split(';')[0] as string);

    const failure = await controller.callback({ code: 'code', state }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'APP_SESSION_FAILED', status: 503 });
    expect(headers['retry-after']).toBe('30');
  });

  it('should answer a throttled step-up claim with retry-after instead of prompting identity again', async () => {
    const { controller, headers, redirectedTo } = controllerFor(`${cookieName}=some-handle`);

    const failure = await controller.stepUp({ return_to: '/reports' }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ code: 'APP_SESSION_FAILED', status: 503 });
    expect(headers['retry-after']).toBe('30');
    expect(redirectedTo()).toBeUndefined();
  });
});
