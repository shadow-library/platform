/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { Dispatcher, Module, ShadowApplication, ShadowFactory } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { ContextService, Cookie, Ctx, FastifyModule, FastifyRouter, Get, Headers, HttpController, Post, RawBody } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@HttpController('/inputs')
class InputsController {
  @Post('/echo')
  echo(@Headers() headers: Record<string, string>, @RawBody() raw: Buffer) {
    return { xCustom: headers['x-custom'], rawLength: raw.length, raw: raw.toString() };
  }

  @Get('/context')
  context(@Ctx() ctx: ContextService) {
    return { rid: ctx.getRID() };
  }

  @Get('/cookies')
  cookies(@Cookie() cookies: Record<string, string>) {
    return { session: cookies.session };
  }
}

@Module({ imports: [FastifyModule.forRoot({ controllers: [InputsController] })] })
class InputsModule {}

describe('request input decorators', () => {
  let app: ShadowApplication;
  let router: FastifyRouter;

  beforeAll(async () => {
    app = await ShadowFactory.create(InputsModule).then(instance => instance.start());
    router = app.get(Dispatcher) as FastifyRouter;
  });

  afterAll(() => app.stop());

  it('should inject request headers and the raw body buffer', async () => {
    const response = await router.mockRequest().post('/inputs/echo').headers({ 'x-custom': 'hello' }).body({ name: 'world' });
    expect(response.statusCode).toBe(201);
    const json = response.json();
    expect(json.xCustom).toBe('hello');
    expect(json.rawLength).toBeGreaterThan(0);
    expect(JSON.parse(json.raw)).toStrictEqual({ name: 'world' });
  });

  it('should inject the request-scoped ContextService via @Ctx', async () => {
    const response = await router.mockRequest().get('/inputs/context');
    expect(response.statusCode).toBe(200);
    expect(response.json().rid).toEqual(expect.any(String));
  });

  it('should inject parsed cookies via @Cookie (loads @fastify/cookie lazily)', async () => {
    const response = await router.mockRequest().get('/inputs/cookies').headers({ cookie: 'session=abc123' });
    expect(response.statusCode).toBe(200);
    expect(response.json().session).toBe('abc123');
  });
});
