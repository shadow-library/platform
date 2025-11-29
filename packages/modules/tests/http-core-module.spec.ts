/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { Module, Router, ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { FastifyModule, FastifyRouter, HttpController, HttpStatus, Post } from '@shadow-library/fastify';
import { Response } from 'light-my-request';

/**
 * Importing user defined packages
 */
import { CSRFTokenService, HttpCoreModule } from '@shadow-library/modules/http-core';

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
    @Post('/action')
    @HttpStatus(200)
    doPost() {
      return { status: 'ok' };
    }
  }

  @Module({ imports: [FastifyModule.forRoot({ imports: [HttpCore], controllers: [Controller] })] })
  class AppModule {}

  beforeEach(async () => {
    app = await ShadowFactory.create(AppModule);
    router = app.get(Router);
  });

  describe('Health Check', () => {
    it('should return 200 and status ok', async () => {
      const response = await router.mockRequest().get('/health');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });
  });

  describe('Request Initializer Middleware', () => {
    it('should set x-correlation-id header if not present', async () => {
      const response = await router.mockRequest().get('/health');
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('should retain x-correlation-id header if present', async () => {
      const testCid = 'test-correlation-id';
      const response = await router.mockRequest().get('/health').headers({ 'x-correlation-id': testCid });
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-correlation-id']).toBe(testCid);
    });
  });

  describe('CSRF Protection Middleware', () => {
    it('should skip CSRF protection when no cookies are present', async () => {
      const response = await router.mockRequest().get('/health');
      expect(response.statusCode).toBe(200);
      const csrfCookie = response.cookies.find(c => c.name === 'csrf-token');
      expect(csrfCookie).toBeUndefined();
    });

    it('should set CSRF token cookie on GET request when cookies are present but csrf token is missing', async () => {
      const response = await router.mockRequest().get('/health').cookies({ 'some-cookie': 'value' });
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
      const response = await router.mockRequest().get('/health').headers({ 'x-csrf-token': csrf.token }).cookies({ 'csrf-token': csrf.cookieToken });
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
      const getResponse = await router.mockRequest().get('/health').headers({ 'x-csrf-token': csrf.token }).cookies({ 'csrf-token': csrf.cookieToken });
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
      const response = await router.mockRequest().get('/health').headers({ 'x-csrf-token': 'malformed-token' }).cookies({ 'csrf-token': csrf.cookieToken });
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
      const response = await router.mockRequest().get('/health').headers({ 'x-csrf-token': '12345' }).cookies({ 'csrf-token': csrf.cookieToken });
      expect(response.statusCode).toBe(200);
      expectCSRFCookie(response);
    });
  });

  describe('CSRFTokenService', () => {
    let csrfTokenService: CSRFTokenService;

    beforeEach(async () => {
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
});
