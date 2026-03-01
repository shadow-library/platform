/**
 * Importing npm packages
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';

import { Module, Router, ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { Config } from '@shadow-library/common';
import { FastifyModule, FastifyRouter, Get, HttpController, HttpStatus, Post } from '@shadow-library/fastify';
import { Response } from 'light-my-request';

/**
 * Importing user defined packages
 */
import { CSRFTokenService, HealthService, HttpCoreModule } from '@shadow-library/modules/http-core';

/**
 * Defining types
 */

interface CSRFToken {
  token: string;
  cookieToken: string;
}

/**
 * Declaring the constants
 */

function generateCSRFToken(expiryOffset: number): CSRFToken {
  const token = '0'.repeat(64);
  const expiresAt = (Date.now() + expiryOffset).toString(36);
  const cookieToken = `${expiresAt}:${token}`;
  return { token, cookieToken };
}

function expectCSRFCookie(response: Response): void {
  const cookie = response.cookies.find(c => c.name === 'csrf-token');
  expect(cookie).toBeDefined();
  expect(cookie?.expires).toBeInstanceOf(Date);
  expect(cookie?.value).toMatch(/^[0-9a-z]+:[0-9a-f]{64}$/);
  expect(cookie?.sameSite).toBe('Lax');
  expect(cookie?.path).toBe('/');
}

describe('HttpCore Module', () => {
  let app: ShadowApplication;
  let router: FastifyRouter;
  const HttpCore = HttpCoreModule.forRoot({
    csrf: {
      expiresIn: { seconds: 10 },
      refreshLeeway: { second: 1 },
    },
  });

  @HttpController('/api')
  class Controller {
    @Get('/test')
    @HttpStatus(200)
    doGet() {
      return { status: 'ok' };
    }

    @Post('/action')
    @HttpStatus(200)
    doPost() {
      return { status: 'ok' };
    }
  }

  @Module({ imports: [FastifyModule.forRoot({ imports: [HttpCore], controllers: [Controller] })] })
  class AppModule {}

  describe('Request Initializer Middleware', () => {
    beforeEach(async () => {
      app = await ShadowFactory.create(AppModule);
      router = app.get(Router);
    });

    it('should set x-correlation-id header if not present', async () => {
      const response = await router.mockRequest().get('/api/test');
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('should retain x-correlation-id header if present', async () => {
      const testCid = 'test-correlation-id';
      const response = await router.mockRequest().get('/api/test').headers({ 'x-correlation-id': testCid });
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-correlation-id']).toBe(testCid);
    });
  });

  describe('CSRF Protection Middleware', () => {
    beforeEach(async () => {
      app = await ShadowFactory.create(AppModule);
      router = app.get(Router);
    });

    it('should skip CSRF protection when no cookies are present', async () => {
      const response = await router.mockRequest().get('/api/test');
      expect(response.statusCode).toBe(200);
      const csrfCookie = response.cookies.find(c => c.name === 'csrf-token');
      expect(csrfCookie).toBeUndefined();
    });

    it('should set CSRF token cookie on GET request when cookies are present but csrf token is missing', async () => {
      const response = await router.mockRequest().get('/api/test').cookies({ 'some-cookie': 'value' });
      expect(response.statusCode).toBe(200);
      expectCSRFCookie(response);
    });

    it('should block POST request without CSRF token when cookies are present', async () => {
      const response = await router.mockRequest().post('/api/action').cookies({ 'some-cookie': 'value' });
      expect(response.statusCode).toBe(403);
    });

    it('should allow POST request without cookies (CSRF protection skipped)', async () => {
      const response = await router.mockRequest().post('/api/action');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });

    it('should allow POST request with valid CSRF token', async () => {
      const csrf = generateCSRFToken(200);
      const response = await router.mockRequest().post('/api/action').headers({ 'x-csrf-token': csrf.token }).cookies({ 'csrf-token': csrf.cookieToken });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });

    it('should refresh CSRF token before expiration', async () => {
      const csrf = generateCSRFToken(900);
      const response = await router.mockRequest().get('/api/test').headers({ 'x-csrf-token': csrf.token }).cookies({ 'csrf-token': csrf.cookieToken });
      expect(response.statusCode).toBe(200);
      expectCSRFCookie(response);
    });

    it('should reject expired CSRF token in POST request', async () => {
      const csrf = generateCSRFToken(-1000);
      const response = await router.mockRequest().post('/api/action').headers({ 'x-csrf-token': csrf.token }).cookies({ 'csrf-token': csrf.cookieToken });
      expect(response.statusCode).toBe(403);
    });

    it('should accept expired CSRF token in GET request', async () => {
      const csrf = generateCSRFToken(-100);
      const getResponse = await router.mockRequest().get('/api/test').headers({ 'x-csrf-token': csrf.token }).cookies({ 'csrf-token': csrf.cookieToken });
      expect(getResponse.statusCode).toBe(200);
      expectCSRFCookie(getResponse);
    });

    it('should reject POST request with malformed CSRF token', async () => {
      const csrf = generateCSRFToken(200);
      const response = await router.mockRequest().post('/api/action').headers({ 'x-csrf-token': 'malformed-token' }).cookies({ 'csrf-token': csrf.cookieToken });
      expect(response.statusCode).toBe(403);
    });

    it('should allow GET request with malformed CSRF token', async () => {
      const csrf = generateCSRFToken(200);
      const response = await router.mockRequest().get('/api/test').headers({ 'x-csrf-token': 'malformed-token' }).cookies({ 'csrf-token': csrf.cookieToken });
      expect(response.statusCode).toBe(200);
      expectCSRFCookie(response);
    });

    it('should reject POST request with invalid CSRF token', async () => {
      const csrf = generateCSRFToken(200);
      const response = await router.mockRequest().post('/api/action').headers({ 'x-csrf-token': '12345' }).cookies({ 'csrf-token': csrf.cookieToken });
      expect(response.statusCode).toBe(403);
    });

    it('should allow GET request with invalid CSRF token', async () => {
      const csrf = generateCSRFToken(200);
      const response = await router.mockRequest().get('/api/test').headers({ 'x-csrf-token': '12345' }).cookies({ 'csrf-token': csrf.cookieToken });
      expect(response.statusCode).toBe(200);
      expectCSRFCookie(response);
    });

    describe('when CSRF is disabled', () => {
      let disabledApp: ShadowApplication;
      let disabledRouter: FastifyRouter;

      const HttpCoreDisabled = HttpCoreModule.forRoot({
        csrf: {
          disabled: true,
          expiresIn: { seconds: 10 },
          refreshLeeway: { second: 1 },
        },
      });

      @HttpController('/api')
      class DisabledController {
        @Get('/test')
        @HttpStatus(200)
        doGet() {
          return { status: 'ok' };
        }

        @Post('/action')
        @HttpStatus(200)
        doPost() {
          return { status: 'ok' };
        }
      }

      @Module({ imports: [FastifyModule.forRoot({ imports: [HttpCoreDisabled], controllers: [DisabledController] })] })
      class DisabledAppModule {}

      beforeEach(async () => {
        disabledApp = await ShadowFactory.create(DisabledAppModule);
        disabledRouter = disabledApp.get(Router);
      });

      it('should allow POST request without CSRF token when cookies are present', async () => {
        const response = await disabledRouter.mockRequest().post('/api/action').cookies({ 'some-cookie': 'value' });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
      });

      it('should not set CSRF token cookie on GET request with cookies', async () => {
        const response = await disabledRouter.mockRequest().get('/api/test').cookies({ 'some-cookie': 'value' });
        expect(response.statusCode).toBe(200);
        const csrfCookie = response.cookies.find(c => c.name === 'csrf-token');
        expect(csrfCookie).toBeUndefined();
      });

      it('should allow POST request without CSRF token header when cookies are present', async () => {
        const response = await disabledRouter.mockRequest().post('/api/action').cookies({ 'csrf-token': 'some-value' });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
      });

      it('should allow POST request with invalid CSRF token when cookies are present', async () => {
        const response = await disabledRouter.mockRequest().post('/api/action').headers({ 'x-csrf-token': 'invalid' }).cookies({ 'csrf-token': 'some-value' });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: 'ok' });
      });
    });
  });

  describe('CSRFTokenService', () => {
    let csrfTokenService: CSRFTokenService;

    beforeEach(async () => {
      app = await ShadowFactory.create(AppModule);
      router = app.get(Router);
      csrfTokenService = app.get(CSRFTokenService);
    });

    describe('generateToken', () => {
      it('should generate a valid CSRF token cookie', () => {
        const cookie = csrfTokenService.generateToken();

        expect(cookie.name).toBe('csrf-token');
        expect(cookie.value).toMatch(/^[0-9a-z]+:[0-9a-f]{64}$/);
        expect(cookie.options.httpOnly).toBe(false);
        expect(cookie.options.sameSite).toBe('lax');
        expect(cookie.options.path).toBe('/');
        expect(cookie.options.expires).toBeInstanceOf(Date);
      });

      it('should generate unique tokens on each call', () => {
        const cookie1 = csrfTokenService.generateToken();
        const cookie2 = csrfTokenService.generateToken();

        expect(cookie1.value).not.toBe(cookie2.value);
      });

      it('should set expiry time in the future', () => {
        const cookie = csrfTokenService.generateToken();

        expect(cookie.options.expires!.getTime()).toBeGreaterThan(Date.now());
      });
    });

    describe('validateToken', () => {
      beforeEach(async () => {
        app = await ShadowFactory.create(AppModule);
        router = app.get(Router);
      });

      it('should return invalid when header token is missing', () => {
        const request = { headers: {}, cookies: { 'csrf-token': 'valid:token' } } as any;
        const result = csrfTokenService.validateToken(request);

        expect(result.isValid).toBe(false);
        expect(result.reason).toBeUndefined();
      });

      it('should return invalid when header token is an array', () => {
        const request = { headers: { 'x-csrf-token': ['token1', 'token2'] }, cookies: { 'csrf-token': 'valid:token' } } as any;
        const result = csrfTokenService.validateToken(request);

        expect(result.isValid).toBe(false);
        expect(result.reason).toBeUndefined();
      });

      it('should return invalid with reason missing when cookie is missing', () => {
        const request = { headers: { 'x-csrf-token': 'token' }, cookies: {} } as any;
        const result = csrfTokenService.validateToken(request);

        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('missing');
      });

      it('should return invalid with reason invalid when cookie has no colon', () => {
        const request = { headers: { 'x-csrf-token': 'token' }, cookies: { 'csrf-token': 'invalidtoken' } } as any;
        const result = csrfTokenService.validateToken(request);

        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('invalid');
      });

      it('should return invalid with reason invalid when expiry time is not a number', () => {
        const request = { headers: { 'x-csrf-token': 'token' }, cookies: { 'csrf-token': '!!!invalid!!!:token' } } as any;
        const result = csrfTokenService.validateToken(request);

        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('invalid');
      });

      it('should return invalid with reason expired when token is expired', () => {
        const expiredTime = (Date.now() - 10000).toString(36);
        const request = { headers: { 'x-csrf-token': 'token' }, cookies: { 'csrf-token': `${expiredTime}:token` } } as any;
        const result = csrfTokenService.validateToken(request);

        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('expired');
      });

      it('should return invalid with reason mismatch when tokens do not match', () => {
        const futureTime = (Date.now() + 10000).toString(36);
        const request = { headers: { 'x-csrf-token': 'wrongtoken' }, cookies: { 'csrf-token': `${futureTime}:correcttoken` } } as any;
        const result = csrfTokenService.validateToken(request);

        expect(result.isValid).toBe(false);
        expect(result.reason).toBe('mismatch');
      });

      it('should return valid when tokens match and not expired', () => {
        const futureTime = (Date.now() + 10000).toString(36);
        const token = 'validtoken';
        const request = { headers: { 'x-csrf-token': token }, cookies: { 'csrf-token': `${futureTime}:${token}` } } as any;
        const result = csrfTokenService.validateToken(request);

        expect(result.isValid).toBe(true);
        expect(result.reason).toBeUndefined();
      });

      it('should set shouldRefresh to true when token is close to expiry', () => {
        const closeToExpiry = (Date.now() + 500).toString(36); // 500ms from now, less than 1 second leeway
        const token = 'validtoken';
        const request = { headers: { 'x-csrf-token': token }, cookies: { 'csrf-token': `${closeToExpiry}:${token}` } } as any;
        const result = csrfTokenService.validateToken(request);

        expect(result.isValid).toBe(true);
        expect(result.shouldRefresh).toBe(true);
      });

      it('should set shouldRefresh to false when token is not close to expiry', () => {
        const farFromExpiry = (Date.now() + 5000).toString(36); // 5 seconds from now, more than 1 second leeway
        const token = 'validtoken';
        const request = { headers: { 'x-csrf-token': token }, cookies: { 'csrf-token': `${farFromExpiry}:${token}` } } as any;
        const result = csrfTokenService.validateToken(request);

        expect(result.isValid).toBe(true);
        expect(result.shouldRefresh).toBe(false);
      });
    });
  });

  describe('OpenAPI Configuration', () => {
    describe('when openapi is enabled', () => {
      let openapiApp: ShadowApplication;
      let openapiRouter: FastifyRouter;

      const HttpCoreOpenAPI = HttpCoreModule.forRoot({
        csrf: { expiresIn: { seconds: 10 }, refreshLeeway: { second: 1 } },
        openapi: { enabled: true, routePrefix: '/docs' },
      });

      @Module({ imports: [FastifyModule.forRoot({ imports: [HttpCoreOpenAPI] })] })
      class OpenAPIAppModule {}

      beforeEach(async () => {
        openapiApp = await ShadowFactory.create(OpenAPIAppModule);
        openapiRouter = openapiApp.get(Router);
      });

      it('should serve OpenAPI documentation at custom route prefix', async () => {
        const response = await openapiRouter.mockRequest().get('/docs/');
        expect(response.statusCode).toBe(200);
      });

      it('should serve OpenAPI JSON specification', async () => {
        const response = await openapiRouter.mockRequest().get('/docs/openapi.json');
        expect(response.statusCode).toBe(200);
        const json = response.json();
        expect(json.openapi).toBeDefined();
        expect(json.info).toBeDefined();
      });
    });

    describe('when openapi is disabled', () => {
      let disabledApp: ShadowApplication;
      let disabledRouter: FastifyRouter;

      const HttpCoreNoOpenAPI = HttpCoreModule.forRoot({
        csrf: { expiresIn: { seconds: 10 }, refreshLeeway: { second: 1 } },
        openapi: { enabled: false },
      });

      @Module({ imports: [FastifyModule.forRoot({ imports: [HttpCoreNoOpenAPI] })] })
      class NoOpenAPIAppModule {}

      beforeEach(async () => {
        disabledApp = await ShadowFactory.create(NoOpenAPIAppModule);
        disabledRouter = disabledApp.get(Router);
      });

      it('should not serve OpenAPI documentation', async () => {
        const response = await disabledRouter.mockRequest().get('/dev/api-docs');
        expect(response.statusCode).toBe(404);
      });
    });

    describe('when normalizeSchemaIds is enabled', () => {
      let normalizedApp: ShadowApplication;
      let normalizedRouter: FastifyRouter;

      const HttpCoreNormalized = HttpCoreModule.forRoot({
        csrf: { expiresIn: { seconds: 10 }, refreshLeeway: { second: 1 } },
        openapi: { enabled: true, routePrefix: '/docs', normalizeSchemaIds: true },
      });

      @Module({ imports: [FastifyModule.forRoot({ imports: [HttpCoreNormalized] })] })
      class NormalizedAppModule {}

      beforeEach(async () => {
        normalizedApp = await ShadowFactory.create(NormalizedAppModule);
        normalizedRouter = normalizedApp.get(Router);
      });

      it('should serve OpenAPI with normalized schema IDs', async () => {
        const response = await normalizedRouter.mockRequest().get('/docs/openapi.json');
        expect(response.statusCode).toBe(200);
        const json = response.json();
        expect(json.components).toBeDefined();
      });
    });
  });

  describe('Helmet Configuration', () => {
    let helmetApp: ShadowApplication;
    let helmetRouter: FastifyRouter;

    @HttpController('/api')
    class HelmetController {
      @Get('/test')
      @HttpStatus(200)
      doGet() {
        return { status: 'ok' };
      }
    }

    async function setupHelmet(enabled: boolean) {
      const HttpCoreHelmet = HttpCoreModule.forRoot({
        csrf: { expiresIn: { seconds: 10 }, refreshLeeway: { second: 1 } },
        helmet: { enabled },
      });

      @Module({ imports: [FastifyModule.forRoot({ imports: [HttpCoreHelmet], controllers: [HelmetController] })] })
      class HelmetAppModule {}

      helmetApp = await ShadowFactory.create(HelmetAppModule);
      helmetRouter = helmetApp.get(Router);
    }

    it('should set security headers when helmet is enabled', async () => {
      await setupHelmet(true);
      const response = await helmetRouter.mockRequest().get('/api/test');
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-dns-prefetch-control']).toBe('off');
      expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    });

    it('should not set security headers when helmet is disabled', async () => {
      await setupHelmet(false);
      const response = await helmetRouter.mockRequest().get('/api/test');
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-content-type-options']).toBeUndefined();
      expect(response.headers['x-dns-prefetch-control']).toBeUndefined();
      expect(response.headers['x-frame-options']).toBeUndefined();
    });
  });

  describe('Compress Configuration', () => {
    let compressApp: ShadowApplication;
    let compressRouter: FastifyRouter;

    @HttpController('/api')
    class CompressController {
      @Get('/test')
      @HttpStatus(200)
      doGet() {
        return { status: 'ok' };
      }
    }

    async function setupCompression(enabled: boolean) {
      const HttpCoreCompress = HttpCoreModule.forRoot({
        csrf: { expiresIn: { seconds: 10 }, refreshLeeway: { second: 1 } },
        compress: { enabled, threshold: 0 },
      });

      @Module({ imports: [FastifyModule.forRoot({ imports: [HttpCoreCompress], controllers: [CompressController] })] })
      class CompressAppModule {}

      compressApp = await ShadowFactory.create(CompressAppModule);
      compressRouter = compressApp.get(Router);
    }

    it('should support compression when enabled', async () => {
      await setupCompression(true);
      const response = await compressRouter.mockRequest().get('/api/test').headers({ 'accept-encoding': 'gzip' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-encoding']).toBe('gzip');
    });

    it('should not compress response when disabled', async () => {
      await setupCompression(false);
      const response = await compressRouter.mockRequest().get('/api/test').headers({ 'accept-encoding': 'gzip' });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-encoding']).toBeUndefined();
    });
  });

  describe('Health Check Service', () => {
    let healthApp: ShadowApplication;
    const healthPort = 18081;
    const healthHost = 'localhost';
    const healthBaseUrl = `http://${healthHost}:${healthPort}`;

    beforeAll(async () => {
      Object.assign(Config['envVars'], { HEALTH_HOST: healthHost, HEALTH_PORT: healthPort.toString() });
      Config['cache'].set('health.enabled', true);

      const HttpCoreHealth = HttpCoreModule.forRoot();

      @Module({ imports: [FastifyModule.forRoot({ imports: [HttpCoreHealth] })] })
      class HealthAppModule {}

      healthApp = await ShadowFactory.create(HealthAppModule);
    });

    afterAll(() => healthApp.stop());

    describe('Liveness Probe', () => {
      it('should return 200 OK for GET /health/live', async () => {
        const response = await fetch(`${healthBaseUrl}/health/live`);
        expect(response.status).toBe(200);
        await expect(response.text()).resolves.toBe('ok');
      });

      it('should return 200 OK for HEAD /health/live', async () => {
        const response = await fetch(`${healthBaseUrl}/health/live`, { method: 'HEAD' });
        expect(response.status).toBe(200);
      });

      it('should return 405 Method Not Allowed for POST /health/live', async () => {
        const response = await fetch(`${healthBaseUrl}/health/live`, { method: 'POST' });
        expect(response.status).toBe(405);
      });
    });

    describe('Readiness Probe', () => {
      it('should return 200 OK for GET /health/ready after application is ready', async () => {
        const response = await fetch(`${healthBaseUrl}/health/ready`);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe('ok');
      });

      it('should return 200 OK for HEAD /health/ready after application is ready', async () => {
        const response = await fetch(`${healthBaseUrl}/health/ready`, { method: 'HEAD' });
        expect(response.status).toBe(200);
      });

      it('should return 503 Service Unavailable before application is ready', async () => {
        const healthService = healthApp.select(HttpCoreModule).get(HealthService);
        healthService['isReady'] = false;

        const response = await fetch(`${healthBaseUrl}/health/ready`);
        expect(response.status).toBe(503);
        expect(await response.text()).toBe('not ready');
      });

      it('should return 405 Method Not Allowed for POST /health/ready', async () => {
        const response = await fetch(`${healthBaseUrl}/health/ready`, { method: 'POST' });
        expect(response.status).toBe(405);
      });
    });

    describe('Unknown Routes', () => {
      it('should return 404 Not Found for unknown routes', async () => {
        const response = await fetch(`${healthBaseUrl}/unknown`);
        expect(response.status).toBe(404);
      });

      it('should return 404 Not Found for /health without subpath', async () => {
        const response = await fetch(`${healthBaseUrl}/health`);
        expect(response.status).toBe(404);
      });
    });
  });
});
