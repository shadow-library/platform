/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it } from 'bun:test';

import { Router, ShadowFactory } from '@shadow-library/app';
import { FastifyModule, FastifyRouter } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { HealthModule } from '@shadow-library/module';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('Health Module', () => {
  let router: FastifyRouter;

  beforeEach(async () => {
    const httpModule = FastifyModule.forRoot({ imports: [HealthModule] });
    const app = await ShadowFactory.create(httpModule);
    router = app.get(Router);
  });

  it('should return OK status', async () => {
    const response = await router.mockRequest().get('/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
