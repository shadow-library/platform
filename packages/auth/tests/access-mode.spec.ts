import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import 'reflect-metadata';
import { Dispatcher, Module, type ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { AppError } from '@shadow-library/common';
import { type RestoreConfig, setConfig } from '@shadow-library/common/testing';
import { type ContextService, FastifyModule } from '@shadow-library/fastify';

import { AuthClient, AuthErrorCode } from '@shadow-library/auth';
import {
  AppSessionService,
  AuthAccessPolicy,
  AuthController,
  AuthModule,
  resolveAccessMode,
  resolveAuthClientConfig,
  resolveAuthRoutes,
  resolveBrowserAuthConfig,
} from '@shadow-library/auth/module';
import { createTestIdP, type TestIdP } from '@shadow-library/auth/testing';

interface MockRouter {
  mockRequest(options: { method: string; url: string }): Promise<{ statusCode: number; payload: string }>;
}

const CLIENT = { id: 'svc-reports', secret: 's3cr3t' };
const AUDIENCE = 'api://reports';

describe('access mode resolution', () => {
  let restore: RestoreConfig | undefined;
  afterEach(() => restore?.());

  it('should default to public when neither the environment nor the code names a mode', () => {
    expect(resolveAccessMode()).toBe('public');
  });

  it('should take the mode the application declares in code when the environment is silent', () => {
    expect(resolveAccessMode({ defaultAccessMode: 'private' })).toBe('private');
  });

  it('should let the environment override the mode declared in code', () => {
    restore = setConfig({ 'auth.access-mode': 'public' });
    expect(resolveAccessMode({ defaultAccessMode: 'private' })).toBe('public');

    restore();
    restore = setConfig({ 'auth.access-mode': 'private' });
    expect(resolveAccessMode({ defaultAccessMode: 'public' })).toBe('private');
  });

  it('should keep the mode out of the auth client configuration', () => {
    expect(resolveAuthClientConfig({ issuer: 'https://identity.test', defaultAccessMode: 'private' })).not.toHaveProperty('defaultAccessMode');
  });

  it('should provide and export the access policy from the dynamic module', () => {
    const dynamicModule = AuthModule.forRoot({ issuer: 'https://identity.test', audience: AUDIENCE, defaultAccessMode: 'public' });
    const provider = (dynamicModule.providers ?? []).find(entry => typeof entry === 'object' && 'token' in entry && entry.token === AuthAccessPolicy);

    expect(provider).toBeDefined();
    expect(dynamicModule.exports).toContain(AuthAccessPolicy);
  });
});

describe('private mode boot assertion', () => {
  let restore: RestoreConfig | undefined;
  afterEach(() => restore?.());

  const bootFailure = (run: () => unknown): unknown => {
    try {
      run();
    } catch (error) {
      return error;
    }
    return undefined;
  };

  it('should refuse a private application without a client credential, since nobody could sign in', () => {
    const failure = bootFailure(() => AuthModule.forRoot({ issuer: 'https://identity.test', audience: AUDIENCE, defaultAccessMode: 'private' }));

    expect(AppError.is(failure, AuthErrorCode.CONFIG_INVALID)).toBe(true);
    expect((failure as AppError).message).toContain('access mode is private but the browser sign-in flow is off');
  });

  it('should refuse a private application whose browser login is switched off', () => {
    const options = { issuer: 'https://identity.test', appId: CLIENT.id, client: CLIENT, browser: { enabled: false }, defaultAccessMode: 'private' as const };
    expect(
      AppError.is(
        bootFailure(() => AuthModule.forRoot(options)),
        AuthErrorCode.CONFIG_INVALID,
      ),
    ).toBe(true);
  });

  it('should refuse a private application whose login or callback route is disabled, naming which', () => {
    const boot = (routes: { login?: false; callback?: false }): AppError =>
      bootFailure(() => AuthModule.forRoot({ issuer: 'https://identity.test', appId: CLIENT.id, client: CLIENT, routes, defaultAccessMode: 'private' })) as AppError;

    for (const [routes, cause] of [
      [{ login: false }, 'the login route is disabled'],
      [{ callback: false }, 'the callback route is disabled'],
      [{ login: false, callback: false }, 'the login and callback routes are disabled'],
    ] as const) {
      const failure = boot(routes);
      expect(AppError.is(failure, AuthErrorCode.CONFIG_INVALID)).toBe(true);
      expect(failure.message).toContain(`access mode is private but ${cause}`);
    }
  });

  it('should assert against the resolved mode, so an environment taking the app public lifts it', () => {
    restore = setConfig({ 'auth.access-mode': 'public' });
    expect(bootFailure(() => AuthModule.forRoot({ issuer: 'https://identity.test', audience: AUDIENCE, defaultAccessMode: 'private' }))).toBeUndefined();
  });
});

describe('access route', () => {
  it('should answer with the resolved mode', () => {
    const auth = new AuthClient({ issuer: 'https://identity.test', audience: AUDIENCE, client: CLIENT });
    const config = resolveBrowserAuthConfig({ issuer: 'https://identity.test', client: CLIENT }, resolveAuthRoutes(), { enabled: true });
    const sessions = new AppSessionService(auth, config);

    expect(new AuthController(sessions, {} as ContextService, new AuthAccessPolicy('private')).access()).toEqual({ mode: 'private' });
    expect(new AuthController(sessions, {} as ContextService, new AuthAccessPolicy('public')).access()).toEqual({ mode: 'public' });
    auth.stop();
  });

  describe('when switched off', () => {
    let idp: TestIdP;
    let app: ShadowApplication;

    beforeAll(async () => {
      idp = await createTestIdP({ clientId: CLIENT.id, clientSecret: CLIENT.secret, app: { audience: AUDIENCE } });
      const auth = AuthModule.forRoot({ issuer: idp.issuer, audience: AUDIENCE, appId: CLIENT.id, client: CLIENT, routes: { access: false } });

      @Module({ imports: [FastifyModule.forRoot({ imports: [auth] })] })
      class TestAppModule {}

      app = await ShadowFactory.create(TestAppModule);
    });

    afterAll(async () => {
      await app.stop();
      idp.stop();
    });

    it('should not be mounted', async () => {
      const router = app.get(Dispatcher) as unknown as MockRouter;
      expect((await router.mockRequest({ method: 'GET', url: '/auth/access' })).statusCode).toBe(404);
      expect((await router.mockRequest({ method: 'GET', url: '/auth/login' })).statusCode).toBe(302);
    });
  });
});
