/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { Router, ShadowFactory } from '@shadow-library/app';
import { FastifyRouter } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AppModule } from '@server/app.module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Server', () => {
  let router: FastifyRouter;

  beforeEach(async () => {
    const app = await ShadowFactory.create(AppModule);
    router = app.get(Router);
  });

  it('should return health check', async () => {
    const response = await router.mockRequest().get('/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
