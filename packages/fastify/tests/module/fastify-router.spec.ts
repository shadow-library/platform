/**
 * Importing npm packages
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ControllerRouteMetadata } from '@shadow-library/app';
import { ClassSchema, Field, Schema } from '@shadow-library/class-schema';
import { Fn, InternalError, Logger, utils, withThis } from '@shadow-library/common';
import { FastifyInstance, fastify } from 'fastify';

/**
 * Importing user defined packages
 */
import { HTTP_CONTROLLER_TYPE } from '@lib/constants';
import { ContextService, FastifyModule, FastifyRouter, HttpMethod, Sensitive, ServerMetadata, Transform } from '@shadow-library/fastify';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

describe('FastifyRouter', () => {
  let router: FastifyRouter;
  let instance: FastifyInstance;
  const config = FastifyModule['getDefaultConfig']();
  const Class = class {};
  const classInstance = new Class();
  const context = new ContextService();
  const handler = jest.fn();
  const handlerName = handler.name;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    instance = fastify();
    config.transformers = { stringify: (value: unknown) => String(value) } as any;
    router = new FastifyRouter(config, instance, context);
  });

  it('should return the fastify instance', () => {
    expect(router.getInstance()).toBe(instance);
  });

  it('should start the server', async () => {
    const listen = jest.spyOn(instance, 'listen').mockReturnThis();
    await router.start();
    expect(listen).toBeCalledWith({ port: 8080, host: 'localhost' });
  });

  it('should stop the server', async () => {
    const close = jest.spyOn(instance, 'close').mockReturnThis();
    await router.stop();
    expect(close).toBeCalled();
  });

  it('should register raw body parser', () => {
    const request = { routeOptions: { config: { metadata: { rawBody: true } } } } as any;
    const buffer = Buffer.from('{"key": "value"}');
    const instance = router.getInstance();
    const done = () => {};
    const parser = jest.fn();
    jest.spyOn(instance, 'getDefaultJsonParser').mockReturnValue(parser);
    const addContentTypeParser = jest.spyOn(instance, 'addContentTypeParser').mockReturnThis();

    router['registerRawBody']();
    const handler = addContentTypeParser.mock.lastCall?.[2];
    handler?.(request, buffer, done);

    expect(addContentTypeParser).toHaveBeenCalledWith('application/json', { parseAs: 'buffer' }, expect.any(Function));
    expect(parser).toHaveBeenCalledWith(request, buffer.toString(), done);
    expect(request.rawBody).toBe(buffer);
  });

  describe('maskField', () => {
    it('should mask field type email', () => {
      jest.spyOn(utils.string, 'maskEmail').mockReturnValue('****@example.com');

      const result = router['maskField']('test@example.com', { 'x-fastify': { type: 'email' } });

      expect(result).toBe('****@example.com');
      expect(utils.string.maskEmail).toBeCalledWith('test@example.com');
    });

    it('should mask field type number', () => {
      jest.spyOn(utils.string, 'maskNumber').mockReturnValue('****');

      const result = router['maskField'](1234567890, { 'x-fastify': { type: 'number' } });

      expect(result).toBe('****');
      expect(utils.string.maskNumber).toBeCalledWith('1234567890');
    });

    it('should mask field type words', () => {
      jest.spyOn(utils.string, 'maskWords').mockReturnValue('****');

      const result = router['maskField']('some sensitive information', { 'x-fastify': { type: 'words' } });

      expect(result).toBe('****');
      expect(utils.string.maskWords).toBeCalledWith('some sensitive information');
    });

    it('should mask field type secrets', () => {
      const result = router['maskField']({ obj: 'value' }, {});
      expect(result).toBe('****');
    });
  });

  describe('mockRequest', () => {
    it('should mock with options', () => {
      const fn = jest.spyOn(instance, 'inject').mockReturnThis();
      router.mockRequest({});
      expect(fn).toBeCalledWith({});
    });

    it('should mock using chain', () => {
      const fn = jest.spyOn(instance, 'inject').mockReturnThis();
      router.mockRequest();
      expect(fn).toBeCalledWith();
    });
  });

  describe('parseControllers', () => {
    const parseControllers = (controllers: ControllerRouteMetadata[]) => router['parseControllers'](controllers);
    class Middleware {
      use = jest.fn();
      generate = jest.fn(withThis((ctx: Middleware) => ctx.use()));
    }
    const middleware = new Middleware();

    it('should throw error if controller type is not supported', () => {
      const controller = { metadata: { [HTTP_CONTROLLER_TYPE]: 'unknown' } } as any;
      expect(() => parseControllers([controller])).toThrow(InternalError);
    });

    it('should parse router controller', () => {
      const metadata = { [HTTP_CONTROLLER_TYPE]: 'router', path: '/api' } as const;
      const parsedControllers = parseControllers([
        { metadata, metatype: Class, instance: classInstance, routes: [{ metadata: { path: '/single' }, handler, handlerName, paramtypes: [] }] },
      ]);

      expect(parsedControllers.routes).toHaveLength(1);
      expect(parsedControllers.middlewares).toHaveLength(0);
      expect(parsedControllers.routes[0]).toStrictEqual({ metatype: Class, instance: classInstance, paramtypes: [], handler, handlerName, metadata: { path: '/api/single' } });
    });

    it('should add default path if path is not provided', () => {
      const metadata = { [HTTP_CONTROLLER_TYPE]: 'router' } as const;
      const parsedControllers = parseControllers([{ metadata, metatype: Class, instance: classInstance, routes: [{ metadata: {}, handler, handlerName, paramtypes: [] }] }]);

      expect(parsedControllers.routes[0]?.metadata).toStrictEqual({ path: '/' });
    });

    it('should add default version prefix if versioning is enabled', () => {
      router['config'].prefixVersioning = true;
      const metadata = { [HTTP_CONTROLLER_TYPE]: 'router', path: '/api' } as const;
      const parsedControllers = parseControllers([
        { metadata, metatype: Class, instance: classInstance, routes: [{ metadata: { path: '/users' }, handler, handlerName, paramtypes: [] }] },
      ]);

      expect(parsedControllers.routes[0]?.metadata).toStrictEqual({ path: '/v1/api/users' });
    });

    it('should set version prefix if versioning is enabled', () => {
      router['config'].prefixVersioning = true;
      const metadata = { [HTTP_CONTROLLER_TYPE]: 'router', path: '/api' } as const;
      const parsedControllers = parseControllers([
        { metadata, metatype: Class, instance: classInstance, routes: [{ metadata: { path: '/users', version: 3 }, handler, handlerName, paramtypes: [] }] },
      ]);

      expect(parsedControllers.routes[0]?.metadata).toStrictEqual({ path: '/v3/api/users', version: 3 });
    });

    it('should parse generate middleware controller', () => {
      const metadata = { [HTTP_CONTROLLER_TYPE]: 'middleware', type: 'preHandler', generates: true, weight: 0 } as const;
      const parsedControllers = parseControllers([{ metadata, metatype: Middleware, instance: middleware, routes: [] }]);
      parsedControllers.middlewares[0]?.handler();

      expect(middleware.use).toBeCalled();
      expect(parsedControllers.routes).toHaveLength(0);
      expect(parsedControllers.middlewares).toHaveLength(1);
      expect(parsedControllers.middlewares[0]).toStrictEqual({
        metatype: Middleware,
        instance: middleware,
        paramtypes: [],
        handler: expect.any(Function),
        handlerName: 'generate',
        metadata,
      });
    });

    it('should parse use middleware controller', () => {
      const metadata = { [HTTP_CONTROLLER_TYPE]: 'middleware', type: 'preHandler', generates: false, weight: 0 } as const;
      const parsedControllers = parseControllers([{ metadata, metatype: Middleware, instance: middleware, routes: [] }]);
      parsedControllers.middlewares[0]?.handler();

      expect(middleware.generate).not.toBeCalled();
      expect(parsedControllers.routes).toHaveLength(0);
      expect(parsedControllers.middlewares).toHaveLength(1);
      expect(parsedControllers.middlewares[0]).toStrictEqual({
        metatype: Middleware,
        instance: middleware,
        paramtypes: [],
        handler: expect.any(Function),
        handlerName: 'use',
        metadata,
      });
    });

    it('should sort middlewares by weight', () => {
      const metadata1 = { [HTTP_CONTROLLER_TYPE]: 'middleware', type: 'preHandler', generates: true, weight: 1 } as const;
      const metadata2 = { [HTTP_CONTROLLER_TYPE]: 'middleware', type: 'preHandler', generates: false, weight: 0 } as const;
      const parsedControllers = parseControllers([
        { metadata: metadata1, metatype: Middleware, instance: middleware, routes: [] },
        { metadata: metadata2, metatype: Middleware, instance: middleware, routes: [] },
      ]);

      expect(parsedControllers.middlewares[0]?.metadata).toStrictEqual(metadata1);
      expect(parsedControllers.middlewares[1]?.metadata).toStrictEqual(metadata2);
    });
  });

  describe('generateRouteHandler', () => {
    const data = { msg: 'Hello World' };
    const handler = jest.fn().mockReturnValue(data);
    const mockFn = () => jest.fn().mockReturnThis();
    const request = { params: {}, query: {}, body: {} } as any;
    const response = { sent: false, status: mockFn(), send: mockFn(), header: mockFn(), redirect: mockFn(), viewAsync: mockFn() } as any;
    const generateRouteHandler = (metadata: ServerMetadata) =>
      router['generateRouteHandler']({ metatype: Class, instance: classInstance, metadata, handler, handlerName, paramtypes: [] });

    it('should set the provided status code', async () => {
      const routeHandler = generateRouteHandler({ status: 204, method: HttpMethod.POST });
      await routeHandler(request, response);
      expect(response.status).toBeCalledWith(204);
    });

    it('should set the status code from the response schema if there is only one exact schema match', async () => {
      const routeHandler = generateRouteHandler({ schemas: { response: { 200: {} } }, method: HttpMethod.GET });
      await routeHandler(request, response);
      expect(response.status).toBeCalledWith(200);
    });

    it('should set the default status code', async () => {
      const getHandler = generateRouteHandler({ method: HttpMethod.GET, schemas: { response: { 201: {}, 202: {} } } });
      await getHandler(request, response);
      expect(response.status).toBeCalledWith(200);

      const postHandler = generateRouteHandler({ method: HttpMethod.POST });
      await postHandler(request, response);
      expect(response.status).toBeCalledWith(201);
    });

    it('should set the provided headers', async () => {
      const headers = { 'Content-Type': 'application/json', 'X-Test': () => 'test' };
      const routeHandler = generateRouteHandler({ headers });
      await routeHandler(request, response);
      expect(response.header).toHaveBeenNthCalledWith(1, 'Content-Type', 'application/json');
      expect(response.header).toHaveBeenNthCalledWith(2, 'X-Test', 'test');
    });

    it('should call the handler with the correct arguments', async () => {
      jest.spyOn(Reflect, 'getMetadata').mockReturnValue(['params', 'request', class {}, 'query', Object, 'response', 'body']);
      const routeHandler = generateRouteHandler({});
      await routeHandler(request, response);
      expect(handler).toBeCalledWith(request.params, request, undefined, request.query, undefined, response, request.body);
    });

    it('should redirect if redirect is provided', async () => {
      const routeHandler = generateRouteHandler({ redirect: '/redirect' });
      await routeHandler(request, response);
      expect(response.status).toBeCalledWith(301);
      expect(response.redirect).toBeCalledWith('/redirect');
    });

    it('should render the static template', async () => {
      const data = { msg: 'Hello World' };
      handler.mockReturnValue(data);
      const routeHandler = generateRouteHandler({ render: 'template' });
      await routeHandler(request, response);
      expect(response.viewAsync).toBeCalledWith('template', data);
    });

    it('should render the dynamic template', async () => {
      const data = { template: 'sample', data: { msg: 'Hello World' } };
      handler.mockReturnValue(data);
      const routeHandler = generateRouteHandler({ render: true });
      await routeHandler(request, response);
      expect(response.viewAsync).toBeCalledWith('sample', data.data);
    });
  });

  describe('register', () => {
    let route: any;

    beforeEach(() => {
      config.responseSchema = undefined;
      route = { metadata: { path: '/', method: HttpMethod.GET, rawBody: true } };
      router['parseControllers'] = jest.fn().mockReturnValue({ routes: [route], middlewares: [] }) as any;
      router['generateRouteHandler'] = jest.fn().mockReturnValue(jest.fn()) as any;
      instance.route = jest.fn().mockReturnThis() as any;
    });

    it('should register raw body parser', async () => {
      const registerRawBody = jest.spyOn(router, 'registerRawBody' as any).mockReturnThis();
      await router.register([]);
      expect(registerRawBody).toBeCalled();
    });

    it('should register single method route', async () => {
      await router.register([]);
      expect(instance.route).toBeCalledWith({
        config: { metadata: route.metadata, artifacts: { transformers: {}, masks: {} } },
        attachValidation: false,
        handler: expect.any(Function),
        method: ['GET'],
        url: '/',
        schema: { response: {} },
      });
    });

    it('should register multiple method route', async () => {
      route.metadata = { path: '/', method: HttpMethod.ALL };
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'] }));
    });

    it('should generate the artifacts for sensitive data masking', async () => {
      @Schema()
      class SensitiveClass {
        @Sensitive()
        @Field()
        password: string;
      }

      const mask = router['maskField'].bind(router);
      const schema = ClassSchema.generate(SensitiveClass);
      route.metadata.schemas = { body: schema, params: schema, query: schema };
      router['config'].maskSensitiveData = true;
      await router.register([]);
      expect(instance.route).toBeCalledWith({
        config: {
          metadata: route.metadata,
          artifacts: {
            transformers: {},
            masks: { body: expect.any(Function), params: expect.any(Function), query: expect.any(Function) },
          },
        },
        attachValidation: false,
        handler: expect.any(Function),
        method: ['GET'],
        url: '/',
        schema: { response: {}, body: schema, params: schema, querystring: schema },
      });
      expect(jest.mocked(instance.route).mock.calls[0]?.[0].config?.artifacts?.masks?.body?.({ password: 'secret' }, mask)).toEqual({ password: '****' });
      expect(jest.mocked(instance.route).mock.calls[0]?.[0].config?.artifacts?.masks?.params?.({ password: 'secret' }, mask)).toEqual({ password: '****' });
      expect(jest.mocked(instance.route).mock.calls[0]?.[0].config?.artifacts?.masks?.query?.({ password: 'secret' }, mask)).toEqual({ password: '****' });
    });

    it('should generate the artifacts for request body transformation', async () => {
      @Schema()
      class Body {
        @Field(() => String)
        @Transform('bigint:parse')
        value: bigint;
      }

      const middleware = async () => {};
      const toBigInt = (value: any) => BigInt(value);
      const bodySchema = ClassSchema.generate(Body);
      route.metadata.schemas = { body: Body };
      route.metadata.preHandler = [middleware];
      await router.register([]);
      expect(instance.route).toBeCalledWith({
        config: {
          metadata: route.metadata,
          artifacts: { transformers: { body: expect.any(Function) }, masks: {} },
        },
        attachValidation: false,
        handler: expect.any(Function),
        preHandler: [expect.any(Function), middleware],
        method: ['GET'],
        url: '/',
        schema: { response: {}, body: bodySchema },
      });

      expect(jest.mocked(instance.route).mock.calls[0]?.[0].config?.artifacts?.transformers?.body?.({ value: '12345678901234567890' }, toBigInt)).toStrictEqual({
        value: BigInt('12345678901234567890'),
      });
    });

    it('should generate the artifacts for the request query transformation', async () => {
      @Schema()
      class Query {
        @Field(() => String)
        @Transform('bigint:parse')
        value: bigint;
      }

      const middleware = async () => {};
      const toBigInt = (value: any) => BigInt(value);
      const querySchema = ClassSchema.generate(Query);
      route.metadata.schemas = { query: Query };
      route.metadata.preHandler = [middleware];
      await router.register([]);
      expect(instance.route).toBeCalledWith({
        config: {
          metadata: route.metadata,
          artifacts: { transformers: { query: expect.any(Function) }, masks: {} },
        },
        attachValidation: false,
        handler: expect.any(Function),
        preHandler: [expect.any(Function), middleware],
        method: ['GET'],
        url: '/',
        schema: { response: {}, querystring: querySchema },
      });

      expect(jest.mocked(instance.route).mock.calls[0]?.[0].config?.artifacts?.transformers?.query?.({ value: '12345678901234567890' }, toBigInt)).toStrictEqual({
        value: BigInt('12345678901234567890'),
      });
    });

    it('should generate the artifacts for the request params transformation', async () => {
      @Schema()
      class Params {
        @Field(() => String)
        @Transform('bigint:parse')
        value: bigint;
      }

      const middleware = async () => {};
      const toBigInt = (value: any) => BigInt(value);
      const paramsSchema = ClassSchema.generate(Params);
      route.metadata.schemas = { params: Params };
      route.metadata.preHandler = [middleware];
      await router.register([]);
      expect(instance.route).toBeCalledWith({
        config: {
          metadata: route.metadata,
          artifacts: { transformers: { params: expect.any(Function) }, masks: {} },
        },
        attachValidation: false,
        handler: expect.any(Function),
        preHandler: [expect.any(Function), middleware],
        method: ['GET'],
        url: '/',
        schema: { response: {}, params: paramsSchema },
      });

      expect(jest.mocked(instance.route).mock.calls[0]?.[0].config?.artifacts?.transformers?.params?.({ value: '12345678901234567890' }, toBigInt)).toStrictEqual({
        value: BigInt('12345678901234567890'),
      });
    });

    it('should generate the artifacts for the response body transformation', async () => {
      @Schema()
      class Response {
        @Field(() => String)
        @Transform('bigint:parse')
        value: bigint;
      }

      const middleware = async () => {};
      const toBigInt = (value: any) => BigInt(value);
      const responseSchema = ClassSchema.generate(Response);
      route.metadata.schemas = { response: { 200: responseSchema } };
      route.metadata.preSerialization = [middleware];
      await router.register([]);
      expect(instance.route).toBeCalledWith({
        config: {
          metadata: route.metadata,
          artifacts: { transformers: { response: { 200: expect.any(Function) } }, masks: {} },
        },
        attachValidation: false,
        handler: expect.any(Function),
        preSerialization: [middleware, expect.any(Function)],
        method: ['GET'],
        url: '/',
        schema: { response: { 200: responseSchema } },
      });

      expect(jest.mocked(instance.route).mock.calls[0]?.[0].config?.artifacts?.transformers?.response?.[200]?.({ value: '12345678901234567890' }, toBigInt)).toStrictEqual({
        value: BigInt('12345678901234567890'),
      });
    });

    it('should apply the middleware if generator returns a function', async () => {
      handler.mockReturnValue(jest.fn());
      const middleware = { metatype: Class, metadata: { type: 'preHandler', generates: true }, handler, instance: {} } as any;
      jest.mocked(router['parseControllers']).mockReturnValue({ routes: [route], middlewares: [middleware] });
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ preHandler: [expect.any(Function)] }));
    });

    it('should not apply the middleware if generator returns false', async () => {
      handler.mockReturnValue(false);
      const middleware = { metatype: Class, metadata: { type: 'preHandler', generates: true }, handler, instance: {} } as any;
      jest.mocked(router['parseControllers']).mockReturnValue({ routes: [route], middlewares: [middleware] });
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.not.objectContaining({ preHandler: expect.anything() }));
    });

    it('should apply the use middleware', async () => {
      const middleware = { metatype: Class, metadata: { type: 'preHandler', generates: false }, handler } as any;
      jest.mocked(router['parseControllers']).mockReturnValue({ routes: [route], middlewares: [middleware] });
      await router.register([]);
      expect(handler).not.toBeCalled();
      expect(instance.route).toBeCalledWith(expect.objectContaining({ preHandler: [expect.any(Function)] }));
    });

    it('should apply multiple middlewares of the same type', async () => {
      const middleware1 = { metatype: Class, metadata: { type: 'preHandler', generates: false }, handler } as any;
      const middleware2 = { metatype: Class, metadata: { type: 'preHandler', generates: false }, handler } as any;
      jest.mocked(router['parseControllers']).mockReturnValue({ routes: [route], middlewares: [middleware1, middleware2] });
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ preHandler: [expect.any(Function), expect.any(Function)] }));
    });

    it('should apply the cached middleware for the same key', async () => {
      const instance = { cacheKey: () => 'test-key' };
      handler.mockReturnValue(() => {});
      const middleware1 = { metatype: Class, metadata: { type: 'preHandler', generates: true }, handler, instance } as any;
      const middleware2 = { metatype: Class, metadata: { type: 'preHandler', generates: true }, handler, instance } as any;
      jest.mocked(router['parseControllers']).mockReturnValue({ routes: [route], middlewares: [middleware1, middleware2] });
      await router.register([]);
      expect(handler).toBeCalledTimes(1);
    });

    it('should apply the response schema', async () => {
      config.responseSchema = { 200: { type: 'object' } as any };
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ schema: { response: { 200: { type: 'object' } } } }));
    });

    it('should apply the body schema', async () => {
      route.metadata.schemas = { body: { type: 'object' } as any };
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ schema: { body: { type: 'object' }, response: {} } }));
    });

    it('should apply the params schema', async () => {
      route.metadata.schemas = { params: { type: 'object' } as any };
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ schema: { params: { type: 'object' }, response: {} } }));
    });

    it('should apply the query schema', async () => {
      route.metadata.schemas = { query: { type: 'object' } as any };
      await router.register([]);
      expect(instance.route).toBeCalledWith(expect.objectContaining({ schema: { querystring: { type: 'object' }, response: {} } }));
    });

    it('should add operation metadata to the route schema', async () => {
      const operationMetadata = {
        summary: 'Get user by ID',
        description: 'Retrieve a user by their ID',
        tags: ['users'],
      };
      route.metadata.operation = operationMetadata;
      await router.register([]);
      expect(instance.route).toBeCalledWith(
        expect.objectContaining({
          schema: expect.objectContaining({
            summary: 'Get user by ID',
            description: 'Retrieve a user by their ID',
            tags: ['users'],
            response: {},
          }),
        }),
      );
    });

    it('should merge operation metadata with response schemas', async () => {
      const operationMetadata = {
        summary: 'Create user',
        tags: ['users'],
      };
      const responseSchema = { 200: { type: 'object' }, 400: { type: 'object' } };
      route.metadata.operation = operationMetadata;
      route.metadata.schemas = { response: responseSchema };
      await router.register([]);
      expect(instance.route).toBeCalledWith(
        expect.objectContaining({
          schema: expect.objectContaining({
            summary: 'Create user',
            tags: ['users'],
            response: responseSchema,
          }),
        }),
      );
    });

    it('should include all operation metadata fields in the schema', async () => {
      const operationMetadata = {
        summary: 'Update user',
        description: 'Update user information',
        tags: ['users', 'admin'],
        deprecated: false,
        externalDocs: {
          url: 'https://example.com/docs/users',
          description: 'User documentation',
        },
        security: {
          bearerAuth: [],
        },
      };
      route.metadata.operation = operationMetadata;
      await router.register([]);
      expect(instance.route).toBeCalledWith(
        expect.objectContaining({
          schema: expect.objectContaining({
            summary: 'Update user',
            description: 'Update user information',
            tags: ['users', 'admin'],
            deprecated: false,
            externalDocs: operationMetadata.externalDocs,
            security: operationMetadata.security,
            response: {},
          }),
        }),
      );
    });
  });

  describe('child routes', () => {
    const handler = jest.fn<() => Promise<any>>();

    beforeEach(() => {
      router = new FastifyRouter({ ...config, enableChildRoutes: true }, instance, context);
      router['generateRouteHandler'] = jest.fn().mockReturnValue(handler) as any;
    });

    it('should throw error if child routes are not enabled', async () => {
      const nonChildRouter = new FastifyRouter({ ...config, enableChildRoutes: false }, instance, context);
      await expect(nonChildRouter.resolveChildRoute('/child')).rejects.toThrow(InternalError);
    });

    it('should resolve child route with default headers only', async () => {
      const fn = jest.fn<any>().mockResolvedValue({ json: () => ({ status: 'success' }) });
      router['instance'].inject = fn;

      const result = await router.resolveChildRoute('/child/123');
      expect(result).toStrictEqual({ status: 'success' });
      expect(fn).toHaveBeenCalledWith({ method: 'GET', url: '/child/123', headers: { 'x-service': 'internal-child-route' } });
    });

    it('should resolve child route with custom headers from config', async () => {
      const customHeaders = { 'x-user-id': '12345', authorization: 'Bearer token123' };
      const customConfig = { ...config, enableChildRoutes: true, childRouteHeaders: () => customHeaders };
      const customRouter = new FastifyRouter(customConfig, instance, context);

      const fn = jest.fn<any>().mockResolvedValue({ json: () => ({ data: 'custom' }) });
      customRouter['instance'].inject = fn;

      const result = await customRouter.resolveChildRoute('/api/users');
      expect(result).toStrictEqual({ data: 'custom' });
      expect(fn).toHaveBeenCalledWith({
        method: 'GET',
        url: '/api/users',
        headers: {
          'x-user-id': '12345',
          authorization: 'Bearer token123',
          'x-service': 'internal-child-route',
        },
      });
    });

    it('should override custom x-service header with default', async () => {
      const customHeaders = { 'x-service': 'custom-service', 'x-trace-id': 'trace-789' };
      const customConfig = { ...config, enableChildRoutes: true, childRouteHeaders: () => customHeaders };
      const customRouter = new FastifyRouter(customConfig, instance, context);

      const fn = jest.fn<any>().mockResolvedValue({ json: () => ({ overridden: true }) });
      customRouter['instance'].inject = fn;

      const result = await customRouter.resolveChildRoute('/override/test');
      expect(result).toStrictEqual({ overridden: true });
      expect(fn).toHaveBeenCalledWith({
        method: 'GET',
        url: '/override/test',
        headers: {
          'x-trace-id': 'trace-789',
          'x-service': 'internal-child-route', // Should always be this value
        },
      });
    });

    it('should merge request headers with child route headers', async () => {
      const customConfig = { ...config, enableChildRoutes: true, childRouteHeaders: () => ({ 'x-request-id': 'req-456' }) };
      const customRouter = new FastifyRouter(customConfig, instance, context);

      const fn = jest.fn<any>().mockResolvedValue({ json: () => ({ custom: true }) });
      customRouter['instance'].inject = fn;

      const result = await customRouter.resolveChildRoute('/headers', { 'x-comment': 'test-header' });
      expect(result).toStrictEqual({ custom: true });
      expect(fn).toHaveBeenCalledWith({
        method: 'GET',
        url: '/headers',
        headers: {
          'x-request-id': 'req-456',
          'x-service': 'internal-child-route',
          'x-comment': 'test-header',
        },
      });
    });

    it('should handle undefined childRouteHeaders function', async () => {
      const customConfig = { ...config, enableChildRoutes: true, childRouteHeaders: undefined };
      const customRouter = new FastifyRouter(customConfig, instance, context);

      const fn = jest.fn<any>().mockResolvedValue({ json: () => ({ undefined: true }) });
      customRouter['instance'].inject = fn;

      const result = await customRouter.resolveChildRoute('/undefined/headers');
      expect(result).toStrictEqual({ undefined: true });
      expect(fn).toHaveBeenCalledWith({
        method: 'GET',
        url: '/undefined/headers',
        headers: { 'x-service': 'internal-child-route' },
      });
    });

    it('should call childRouteHeaders function for each request', async () => {
      const childRouteHeadersMock = jest.fn(() => ({ 'x-call-count': Date.now().toString() }));
      const customConfig = { ...config, enableChildRoutes: true, childRouteHeaders: childRouteHeadersMock };
      const customRouter = new FastifyRouter(customConfig, instance, context);

      const fn = jest.fn<any>().mockResolvedValue({ json: () => ({ called: true }) });
      customRouter['instance'].inject = fn;

      // Make multiple requests
      await customRouter.resolveChildRoute('/call/1');
      await customRouter.resolveChildRoute('/call/2');
      await customRouter.resolveChildRoute('/call/3');

      // Verify the function was called for each request
      expect(childRouteHeadersMock).toHaveBeenCalledTimes(3);
      expect(childRouteHeadersMock).toHaveBeenCalledWith(context);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('getRequestLogger', () => {
    let httpLogger: jest.Spied<Logger['http']>;
    let contextSpy: jest.Spied<ContextService['get']>;

    beforeEach(() => {
      httpLogger = jest.spyOn(router['logger'], 'http').mockReturnValue();
      contextSpy = jest.spyOn(context, 'get').mockImplementation((key: string | symbol) => (key.toString() === 'Symbol(rid)' ? 'test-rid' : null));
    });

    it('should log request metadata when logging is enabled', () => {
      const req = {
        url: '/test',
        method: 'GET',
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-service': 'test-service', 'content-length': '123' },
        query: { key: 'value' },
        body: { data: 'test' },
        routeOptions: { url: '/test', config: { metadata: {}, artifacts: { transformers: {}, masks: {} } } },
      } as any;
      const res = {
        statusCode: 200,
        raw: { on: jest.fn((_, callback: () => void) => callback()) },
        getHeader: jest.fn().mockReturnValue('456'),
      } as any;
      const cb = jest.fn();

      const logger = router['getRequestLogger']();
      logger.call({} as any, req, res, cb);

      expect(cb).toHaveBeenCalled();
      expect(res.raw.on).toHaveBeenCalledWith('finish', expect.any(Function));
      expect(httpLogger).toHaveBeenCalledWith(expect.stringMatching(/^GET \/test -> 200 \(0\.[0-9]{3}ms\)$/), {
        rid: 'test-rid',
        url: '/test',
        method: 'GET',
        status: 200,
        service: 'test-service',
        reqLen: '123',
        reqIp: '127.0.0.1',
        resLen: '456',
        timeTaken: expect.any(String),
        query: { key: 'value' },
        body: { data: 'test' },
      });
    });

    it('should log request metadata for unknown requests', () => {
      const req = {
        url: '/unknown',
        method: 'GET',
        socket: { remoteAddress: '127.0.0.1' },
        headers: {},
        raw: { url: '/unknown' },
        routeOptions: { config: {} },
      } as any;
      const res = {
        statusCode: 404,
        raw: { on: jest.fn((_, callback: () => void) => callback()) },
        getHeader: jest.fn().mockReturnValue('456'),
      } as any;
      const cb = jest.fn();

      const logger = router['getRequestLogger']();
      logger.call({} as any, req, res, cb);

      expect(cb).toHaveBeenCalled();
      expect(res.raw.on).toHaveBeenCalledWith('finish', expect.any(Function));
      expect(httpLogger).toHaveBeenCalledWith(expect.stringMatching(/^GET \/unknown -> 404 \(0\.[0-9]{3}ms\)$/), {
        rid: 'test-rid',
        url: '/unknown',
        method: 'GET',
        status: 404,
        reqIp: '127.0.0.1',
        resLen: '456',
        timeTaken: expect.any(String),
      });
    });

    it('should log masked request metadata when logging is enabled', () => {
      const mask = jest.fn(() => '***');
      const req = {
        url: '/api/test',
        method: 'POST',
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-service': 'test-service', 'content-length': '123' },
        query: { key: 'value' },
        body: { data: 'test' },
        params: { id: '789' },
        routeOptions: { url: '/api/test', config: { metadata: {}, artifacts: { masks: { body: mask, params: mask, query: mask }, transformers: {} } } },
      } as any;
      const res = {
        statusCode: 200,
        raw: { on: jest.fn((_, callback: () => void) => callback()) },
        getHeader: jest.fn().mockReturnValue('456'),
      } as any;
      const cb = jest.fn();

      const logger = router['getRequestLogger']();
      logger.call({} as any, req, res, cb);

      expect(cb).toHaveBeenCalled();
      expect(res.raw.on).toHaveBeenCalledWith('finish', expect.any(Function));
      expect(httpLogger).toHaveBeenCalledWith(expect.stringMatching(/^POST \/api\/test -> 200 \(0\.[0-9]{3}ms\)$/), {
        rid: 'test-rid',
        url: '/api/test',
        method: 'POST',
        status: 200,
        service: 'test-service',
        reqLen: '123',
        reqIp: '127.0.0.1',
        resLen: '456',
        timeTaken: expect.any(String),
        query: '***',
        body: '***',
        params: '***',
      });
    });

    it('should not log request metadata when logging is disabled', () => {
      contextSpy.mockReturnValueOnce(true);
      const req = {} as any;
      const res = { raw: { on: jest.fn((_, callback: () => void) => callback()) } } as any;
      const cb = jest.fn();

      const logger = router['getRequestLogger']();
      logger.call({} as any, req, res, cb);

      expect(cb).toHaveBeenCalled();
      expect(res.raw.on).toHaveBeenCalledWith('finish', expect.any(Function));
      expect(httpLogger).not.toHaveBeenCalled();
    });
  });

  describe('data transformers', () => {
    @Schema()
    class Data {
      @Field(() => Boolean)
      @Transform('stringify' as any)
      bool: string;

      @Field(() => String)
      @Transform('bigint:parse')
      bigint: bigint;
    }

    const schema = ClassSchema.generate(Data);
    let inputTransform: Fn;
    let outputTransform: Fn;

    beforeEach(() => {
      const transformers = { stringify: (value: unknown) => String(value) } as any;
      router = new FastifyRouter({ ...config, transformers }, instance, context);
      inputTransform = router['inputDataTransformer'].compile(schema);
      outputTransform = router['outputDataTransformer'].compile(schema);
    });

    it('should not transform the request body payload when body transformer is not found', async () => {
      const handler = router['transformRequestHandler']() as any;
      const originalBody = { bool: true, bigint: '5' };
      const request = { routeOptions: { config: {} }, body: originalBody };

      await handler(request, {});
      expect(request.body).toBe(originalBody);
    });

    it('should transform the request body payload', async () => {
      const handler = router['transformRequestHandler']() as any;
      const request = { routeOptions: { config: { artifacts: { transformers: { body: inputTransform } } } }, body: { bool: true, bigint: '5' } };

      await handler(request, {});
      expect(request.body).toEqual({ bool: 'true', bigint: 5n });
    });

    it('should transform the request query payload', async () => {
      const handler = router['transformRequestHandler']() as any;
      const request = { routeOptions: { config: { artifacts: { transformers: { query: inputTransform } } } }, query: { bool: true, bigint: '5' } };

      await handler(request, {});
      expect(request.query).toEqual({ bool: 'true', bigint: 5n });
    });

    it('should transform the request params payload', async () => {
      const handler = router['transformRequestHandler']() as any;
      const request = { routeOptions: { config: { artifacts: { transformers: { params: inputTransform } } } }, params: { bool: true, bigint: '5' } };

      await handler(request, {});
      expect(request.params).toEqual({ bool: 'true', bigint: 5n });
    });

    it('should not transform the response body payload when artifacts are not found', async () => {
      const handler = router['transformResponseHandler']() as any;
      const reply = { statusCode: 200 };
      const payload = { bool: true, bigint: '5' };
      const request = { routeOptions: { config: {} } };

      const result = await handler(request, reply, payload);
      expect(result).toBe(payload);
    });

    it('should transform the response body payload', async () => {
      const handler = router['transformResponseHandler']() as any;
      const reply = { statusCode: 200 };
      const payload = { bool: true, bigint: '5' };
      const request = { routeOptions: { config: { artifacts: { transformers: { response: { 200: inputTransform } } } } } };

      const result = await handler(request, reply, payload);
      expect(result).toEqual({ bool: 'true', bigint: 5n });
    });

    it('should transform the response body payload using fallback status code', async () => {
      const handler = router['transformResponseHandler']() as any;
      const reply = { statusCode: 201 };
      const payload = { bool: true, bigint: '5' };
      const request = { routeOptions: { config: { artifacts: { transformers: { response: { '2xx': inputTransform } } } } } };

      const result = await handler(request, reply, payload);
      expect(result).toEqual({ bool: 'true', bigint: 5n });
    });

    it('should not transform the response body payload when transformer are not found', async () => {
      const handler = router['transformResponseHandler']() as any;
      const reply = { statusCode: 201 };
      const payload = { bool: true, bigint: '5' };
      const request = { routeOptions: { config: { artifacts: { transformers: { response: { 200: inputTransform } } } } } };

      const result = await handler(request, reply, payload);
      expect(result).toBe(payload);
    });
  });
});
