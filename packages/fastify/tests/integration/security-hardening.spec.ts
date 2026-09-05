/**
 * Importing npm packages
 */
import { afterAll, beforeAll, describe, expect, it, jest } from 'bun:test';
import { Dispatcher, Module, ShadowApplication, ShadowFactory } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { Body, FastifyModule, FastifyRouter, Get, HttpController, type HttpRequest, Post, Req } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const SPOOFED_IP = '1.2.3.4';
const PROXY_ATTACHED_IP = '203.0.113.7';

@HttpController('/security')
class SecurityController {
  @Get('/ip')
  ip(@Req() request: HttpRequest) {
    return { ip: request.ip };
  }

  @Post('/echo')
  echo(@Body() body: Record<string, unknown>) {
    return body;
  }
}

describe('trust proxy request.ip resolution', () => {
  describe('with a trusted-CIDR trust proxy', () => {
    let app: ShadowApplication;
    let router: FastifyRouter;

    @Module({ imports: [FastifyModule.forRoot({ controllers: [SecurityController], trustProxy: ['127.0.0.0/8'] })] })
    class TrustedProxyModule {}

    beforeAll(async () => {
      app = await ShadowFactory.create(TrustedProxyModule);
      router = app.get(Dispatcher) as FastifyRouter;
    });

    afterAll(() => app.stop());

    it('should resolve request.ip to the proxy-attached address, not the spoofed left-most x-forwarded-for entry', async () => {
      const response = await router
        .mockRequest()
        .get('/security/ip')
        .headers({ 'x-forwarded-for': `${SPOOFED_IP}, ${PROXY_ATTACHED_IP}` });
      expect(response.statusCode).toBe(200);
      expect(response.json().ip).toBe(PROXY_ATTACHED_IP);
    });
  });

  describe('with the default trust proxy (false)', () => {
    let app: ShadowApplication;
    let router: FastifyRouter;

    @Module({ imports: [FastifyModule.forRoot({ controllers: [SecurityController] })] })
    class UntrustedProxyModule {}

    beforeAll(async () => {
      app = await ShadowFactory.create(UntrustedProxyModule);
      router = app.get(Dispatcher) as FastifyRouter;
    });

    afterAll(() => app.stop());

    it('should ignore a client-supplied x-forwarded-for and fall back to the socket address', async () => {
      const response = await router.mockRequest().get('/security/ip').headers({ 'x-forwarded-for': SPOOFED_IP });
      expect(response.statusCode).toBe(200);
      expect(response.json().ip).toBe('127.0.0.1');
    });
  });
});

describe('request body log redaction', () => {
  let app: ShadowApplication;
  let router: FastifyRouter;

  @Module({ imports: [FastifyModule.forRoot({ controllers: [SecurityController] })] })
  class RedactionModule {}

  beforeAll(async () => {
    app = await ShadowFactory.create(RedactionModule);
    router = app.get(Dispatcher) as FastifyRouter;
  });

  afterAll(() => app.stop());

  it('should mask sensitive fields in the logged metadata while the handler receives the real values', async () => {
    const httpLogger = jest.spyOn(router['logger'], 'http').mockReturnValue();
    const body = {
      username: 'alice',
      postcode: 'SW1A 1AA',
      password: 'hunter2',
      accessToken: 'at_live_1',
      sessionId: 'sess_9',
      code_verifier: 'cv_live_3',
      profile: { apiKey: 'ak_live_1', client_secret: 'cs_live_2' },
    };

    const response = await router.mockRequest().post('/security/echo').body(body);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toStrictEqual(body);
    expect(httpLogger).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: {
          username: 'alice',
          postcode: 'SW1A 1AA',
          password: '****',
          accessToken: '****',
          sessionId: '****',
          code_verifier: '****',
          profile: { apiKey: '****', client_secret: '****' },
        },
      }),
    );
  });
});
