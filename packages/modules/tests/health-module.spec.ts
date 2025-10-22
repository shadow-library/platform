/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { Module, Router, ShadowFactory } from '@shadow-library/app';
import { FastifyModule, FastifyRouter } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { HttpCoreModule } from '@shadow-library/module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('HttpCore Module', () => {
  let router: FastifyRouter;

  @Module({ imports: [FastifyModule.forRoot({ imports: [HttpCoreModule] })] })
  class AppModule {}

  beforeEach(async () => {
    const app = await ShadowFactory.create(AppModule);
    router = app.get(Router);
  });

  describe('Health Check', () => {
    it('it should return 200 and status ok', async () => {
      const response = await router.mockRequest().get('/health');
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });
  });

  describe('Request Initializer Middleware', () => {
    it('it should set x-correlation-id header if not present', async () => {
      const response = await router.mockRequest().get('/health');
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    it('it should retain x-correlation-id header if present', async () => {
      const testCid = 'test-correlation-id';
      const response = await router.mockRequest().get('/health').headers({ 'x-correlation-id': testCid });
      expect(response.statusCode).toBe(200);
      expect(response.headers['x-correlation-id']).toBe(testCid);
    });
  });
});
