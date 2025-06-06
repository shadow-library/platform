/**
 * Importing npm packages
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { Module, Router, ShadowApplication, ShadowFactory } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { FastifyModule, FastifyRouter, Get, HttpController } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('FastifyModule', () => {
  let app: ShadowApplication;
  @HttpController('/hello')
  class HelloController {
    @Get()
    getHello() {
      return { message: 'Hello, World!' };
    }
  }

  @Module({ controllers: [HelloController] })
  class App {}
  const appModule = FastifyModule.forRoot({ imports: [App] });

  beforeEach(() => ShadowFactory.create(appModule).then(application => (app = application)));
  afterEach(() => app.stop());

  it('should start the application', async () => {
    await expect(app.start()).resolves.toBeTruthy();
  });

  it('should respond to GET /hello', async () => {
    const router: FastifyRouter = app.get(Router);
    const response = await router.mockRequest().get('/hello');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ message: 'Hello, World!' });
  });
});
