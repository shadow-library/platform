/**
 * Importing npm packages
 */
import { Router, ShadowApplication, ShadowFactory } from '@shadow-library/app';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

/**
 * Importing user defined packages
 */
import { AppModule } from '@examples/child-routes/app.module';
import { FastifyRouter } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Child Routes', () => {
  let app: ShadowApplication;
  let router: FastifyRouter;

  beforeAll(async () => {
    app = await ShadowFactory.create(AppModule).then(app => app.start());
    router = app.get(Router);
  });

  afterAll(() => app.stop());

  describe('GET /api/unified', () => {
    it('should return the basic unified route', async () => {
      const response = await router.mockRequest().get('/api/unified');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({ message: 'Unified Route', rid: expect.any(String), results: [] });
    });

    it('should return the unified route with child routes', async () => {
      const response = await router.mockRequest().get('/api/unified').query({ routes: '/api/hello,/api/welcome' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        message: 'Unified Route',
        rid: expect.any(String),
        results: [
          { message: 'Hello World!', rid: expect.any(String) },
          { message: 'Welcome to Fastify with Shadow!', rid: expect.any(String) },
        ],
      });
    });

    it('should return the unified route with child routes and query params', async () => {
      const response = await router.mockRequest().get('/api/unified').query({ routes: '/api/hello,/api/welcome,/api/greet?name=Alice' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        message: 'Unified Route',
        rid: expect.any(String),
        results: [
          { message: 'Hello World!', rid: expect.any(String) },
          { message: 'Welcome to Fastify with Shadow!', rid: expect.any(String) },
          { message: 'Hello, Alice!', rid: expect.any(String) },
        ],
      });
    });

    it('should return the unified route with an invalid child route', async () => {
      const response = await router.mockRequest().get('/api/unified').query({ routes: '/api/hello,/api/invalid' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toStrictEqual({
        message: 'Unified Route',
        rid: expect.any(String),
        results: [
          { message: 'Hello World!', rid: expect.any(String) },
          { code: 'S002', type: 'NOT_FOUND', message: 'The requested endpoint does not exist' },
        ],
      });
    });
  });
});
