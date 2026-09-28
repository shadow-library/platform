/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Dispatcher, Module, ShadowApplication, ShadowFactory } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { FastifyModule, FastifyRouter, Get, HttpController, Query } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/api')
class EchoController {
  @Get('/echo/query')
  echo(@Query() query: Record<string, string>): Record<string, string> {
    return query;
  }
}

@Module({ imports: [FastifyModule.forRoot({ controllers: [EchoController] })] })
class EchoModule {}

describe('duplicate slashes', () => {
  let app: ShadowApplication;
  let router: FastifyRouter;

  beforeAll(async () => {
    app = await ShadowFactory.create(EchoModule).then(app => app.start());
    router = app.get(Dispatcher) as FastifyRouter;
  });

  afterAll(() => app.stop());

  it('should route a path holding duplicate slashes', async () => {
    const response = await router.mockRequest().get('//api//echo///query');
    expect(response.statusCode).toBe(200);
  });

  it('should leave duplicate slashes inside the query string untouched', async () => {
    const response = await router.mockRequest().get('//api/echo/query?next=https://example.test//a&path=//b');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ next: 'https://example.test//a', path: '//b' });
  });
});
