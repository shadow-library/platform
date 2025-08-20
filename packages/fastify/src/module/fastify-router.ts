/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { ControllerRouteMetadata, Inject, Injectable, RouteMetadata, Router } from '@shadow-library/app';
import { InternalError, Logger, tryCatch, utils } from '@shadow-library/common';
import merge from 'deepmerge';
import { type FastifyInstance, RouteOptions } from 'fastify';
import findMyWay, { Instance as ChildRouter, HTTPVersion } from 'find-my-way';
import stringify from 'json-stable-stringify';
import { Chain as MockRequestChain, InjectOptions as MockRequestOptions, Response as MockResponse } from 'light-my-request';
import { Class, JsonObject, Promisable } from 'type-fest';

/**
 * Importing user defined packages
 */
import { ChildRouteResponse, ChildRouteResult } from '../classes';
import { FASTIFY_CONFIG, FASTIFY_INSTANCE, HTTP_CONTROLLER_INPUTS, HTTP_CONTROLLER_TYPE, NAMESPACE } from '../constants';
import { HttpMethod, MiddlewareMetadata } from '../decorators';
import { AwaitableRouteHandler, HttpRequest, HttpResponse, RouteHandler, ServerMetadata } from '../interfaces';
import { ContextService } from '../services';
import { type FastifyConfig } from './fastify-module.interface';
import { compileValidator, formatSchemaErrors } from './fastify.utils';

/**
 * Defining types
 */

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }

  interface FastifyContextConfig {
    metadata: ServerMetadata;
  }
}

export interface RequestContext {
  request: HttpRequest;
  response: HttpResponse;
  params: Record<string, string>;
  query: Record<string, string>;
  body: JsonObject;
}

interface ParsedController<T> {
  metatype: Class<unknown>;
  instance: object;
  paramtypes: (string | Class<unknown>)[];
  returnType?: Class<unknown>;

  metadata: T;
  handler: (...args: any[]) => Promisable<any>;
  handlerName: string;
}

interface ParsedControllers {
  middlewares: ParsedController<MiddlewareMetadata>[];
  routes: ParsedController<ServerMetadata>[];
}

export interface RequestMetadata {
  /** request id */
  rid?: string;
  /** Service request id */
  srid?: string;
  method?: string;
  url?: string;
  status?: number;
  reqLen?: string;
  reqIp?: string;
  resLen?: string;
  /** Time taken to process the request */
  timeTaken?: string;
  body?: any;
  query?: object;
  service?: string;
  [key: string]: any;
}

export interface ChildRouteRequest {
  method: HttpMethod.GET;
  url: string;
  params: Record<string, string>;
  query: Record<string, string>;
}

type MiddlewareHandler = ParsedController<MiddlewareMetadata>['handler'];

type ChildRequestHandler = (request: ChildRouteRequest, response: ChildRouteResponse) => Promise<any> | any;

/**
 * Declaring the constants
 */
const httpMethods = Object.values(HttpMethod).filter(m => m !== HttpMethod.ALL) as Exclude<HttpMethod, HttpMethod.ALL>[];

@Injectable()
export class FastifyRouter extends Router {
  static override readonly name = 'FastifyRouter';

  private readonly logger = Logger.getLogger(NAMESPACE, 'FastifyRouter');
  private readonly cachedDynamicMiddlewares = new Map<string, MiddlewareHandler>();
  private readonly childRouter: ChildRouter<HTTPVersion.V1> | null = null;

  constructor(
    @Inject(FASTIFY_CONFIG) private readonly config: FastifyConfig,
    @Inject(FASTIFY_INSTANCE) private readonly instance: FastifyInstance,
    private readonly context: ContextService,
  ) {
    super();
    if (config.enableChildRoutes) {
      const options = utils.object.pickKeys(config, ['ignoreTrailingSlash', 'ignoreDuplicateSlashes', 'allowUnsafeRegex', 'caseSensitive', 'maxParamLength', 'querystringParser']);
      this.childRouter = findMyWay(options);
    }
  }

  getInstance(): FastifyInstance {
    return this.instance;
  }

  private registerRawBody(): void {
    const opts = { parseAs: 'buffer' as const };
    const parser = this.instance.getDefaultJsonParser('error', 'error');
    this.instance.addContentTypeParser<Buffer>('application/json', opts, (req, body, done) => {
      const { metadata } = req.routeOptions.config;
      if (metadata.rawBody) req.rawBody = body;
      return parser(req, body.toString(), done);
    });
  }

  private getRequestLogger(): RouteHandler {
    return async (req, res) => {
      const startTime = process.hrtime();

      res.raw.on('finish', () => {
        const isLoggingDisabled = this.context.get('DISABLE_REQUEST_LOGGING') ?? false;
        if (isLoggingDisabled) return;

        const metadata: RequestMetadata = {};
        metadata.rid = this.context.getRID();
        metadata.url = req.url;
        metadata.method = req.method;
        metadata.status = res.statusCode;

        if (this.context.isChildContext()) metadata.service = 'internal-child-route';
        else {
          metadata.service = req.headers['x-service'] as string | undefined;
          metadata.reqLen = req.headers['content-length'];
          metadata.reqIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
          metadata.resLen = res.getHeader('content-length') as string;
        }

        const resTime = process.hrtime(startTime);
        metadata.timeTaken = (resTime[0] * 1e3 + resTime[1] * 1e-6).toFixed(3); // Converting time to milliseconds
        if (req.query) metadata.query = req.query;
        if (req.body) metadata.body = req.body;
        this.logger.http('http', metadata);
      });
    };
  }

  private parseControllers(controllers: ControllerRouteMetadata[]): ParsedControllers {
    const parsedControllers: ParsedControllers = { middlewares: [], routes: [] };
    for (const controller of controllers) {
      switch (controller.metadata[HTTP_CONTROLLER_TYPE]) {
        case 'router': {
          const { instance, metadata, metatype } = controller;
          const basePath = metadata.path ?? '/';
          for (const route of controller.routes) {
            const routePath = route.metadata.path ?? '';
            const path = basePath + routePath;
            const parsedController: ParsedController<ServerMetadata> = { ...route, instance, metatype };
            parsedController.metadata.path = path;
            parsedControllers.routes.push(parsedController);
          }
          break;
        }

        case 'middleware': {
          const metadata = controller.metadata as MiddlewareMetadata;
          const { instance, metatype } = controller;
          const method = metadata.generates ? 'generate' : 'use';
          const handler = (controller.instance as any)[method].bind(instance);
          parsedControllers.middlewares.push({ metadata, handler, paramtypes: [], instance, metatype, handlerName: method });
          break;
        }

        default: {
          throw new InternalError(`Unknown controller type: ${controller.metadata[HTTP_CONTROLLER_TYPE]}`);
        }
      }
    }

    parsedControllers.middlewares.sort((a, b) => b.metadata.weight - a.metadata.weight);

    return parsedControllers;
  }

  private getStatusCode(metadata: ServerMetadata): number {
    if (metadata.status) return metadata.status;
    const responseStatusCodes = Object.keys(metadata.schemas?.response ?? {}).map(n => parseInt(n));
    const statusCodes = responseStatusCodes.filter(code => code >= 200 && code < 600);
    if (statusCodes.length === 1) return statusCodes[0] as number;
    return metadata.method === HttpMethod.POST ? 201 : 200;
  }

  private generateRouteHandler(route: ParsedController<ServerMetadata>): AwaitableRouteHandler {
    const metadata = route.metadata;
    const statusCode = this.getStatusCode(metadata);
    const argsOrder = (Reflect.getMetadata(HTTP_CONTROLLER_INPUTS, route.instance, route.handlerName) as (keyof RequestContext | undefined)[]) ?? [];

    return async (request, response) => {
      const params = request.params as Record<string, string>;
      const query = request.query as Record<string, string>;
      const body = request.body as JsonObject;
      const context = { request, response, params, query, body };

      /** Setting the status code and headers */
      response.status(statusCode);
      for (const [key, value] of Object.entries(metadata.headers ?? {})) {
        response.header(key, typeof value === 'function' ? value() : value);
      }

      /** Handling the actual route and serializing the output */
      const args = argsOrder.map(arg => arg && context[arg]);
      const data = await route.handler(...args);

      if (metadata.redirect) return response.status(metadata.status ?? 301).redirect(metadata.redirect);

      if (metadata.render) {
        let template = metadata.render;
        let templateData = data;
        if (template === true) {
          template = data.template;
          templateData = data.data;
        }

        return (response as any).viewAsync(template, templateData);
      }

      if (!response.sent && data) return response.send(data);
    };
  }

  public generateChildRouteHandler(route: RouteOptions): ChildRequestHandler {
    const context = this.context.initChild();
    const requestLogger = this.getRequestLogger();

    const { schema, url } = route;
    const method = HttpMethod.GET;
    const paramsValidator = schema?.params ? compileValidator({ method, schema: schema.params, url, httpPart: 'params' }) : null;
    const queryValidator = schema?.querystring ? compileValidator({ method, schema: schema.querystring, url, httpPart: 'querystring' }) : null;

    assert(typeof route.preHandler !== 'function' && typeof route.onError !== 'function', 'handlers must be an array');
    const preHandlers = route.preHandler ?? [];
    const errorHandlers = route.onError ?? [];
    const handlers = [...preHandlers, route.handler];

    return async (request, response) => {
      await context(request);
      await requestLogger(request as any, response as any);

      if (paramsValidator) {
        paramsValidator(request.params) as { value: Record<string, string> };
        if (paramsValidator.errors) throw formatSchemaErrors(paramsValidator.errors, 'params');
      }

      if (queryValidator) {
        const validationResult = queryValidator(request.query) as { value: Record<string, string> };
        request.query = validationResult.value;
      }

      try {
        /** Executing the pre-handlers and the handler */
        for (const handler of handlers) {
          await handler.apply({} as any, [request, response] as any);
          if (response.sent) return;
        }
      } catch (err) {
        /** Executing all the error handlers */
        for (const errorHandler of errorHandlers) {
          const result = await tryCatch(() => errorHandler.apply({} as any, [request, response, err] as any));
          if (!result.success) break;
        }

        /** Executing the default error handler */
        await this.config.errorHandler.handle(err as Error, request as any, response as any);
      }
    };
  }

  private async getMiddlewareHandler(middleware: ParsedController<MiddlewareMetadata>, metadata: RouteMetadata): Promise<MiddlewareHandler | undefined> {
    if (!middleware.metadata.generates) return middleware.handler.bind(middleware.instance);

    /** Generating the cache key and getting the cached middleware */
    const genCacheKey = 'cacheKey' in middleware.instance && typeof middleware.instance.cacheKey === 'function' ? middleware.instance.cacheKey : stringify;
    const cacheKey = genCacheKey(metadata);
    const cachedMiddleware = this.cachedDynamicMiddlewares.get(cacheKey);
    if (cachedMiddleware) return cachedMiddleware;

    /** Generating the middleware handler */
    const handler = await middleware.handler.apply(middleware.instance, [metadata]);
    this.cachedDynamicMiddlewares.set(cacheKey, handler);
    return handler;
  }

  async register(controllers: ControllerRouteMetadata[]): Promise<void> {
    const { middlewares, routes } = this.parseControllers(controllers);
    const defaultResponseSchemas = this.config.responseSchema ?? {};

    const hasRawBody = routes.some(r => r.metadata.rawBody);
    if (hasRawBody) this.registerRawBody();

    this.logger.debug('Registering the global middlewares');
    this.instance.addHook('onRequest', this.context.init());
    this.instance.addHook('onRequest', this.getRequestLogger());
    this.logger.info('Registered global middlewares');

    for (const route of routes) {
      const metadata = route.metadata;
      assert(metadata.path, 'Route path is required');
      assert(metadata.method, 'Route method is required');
      this.logger.debug(`registering route ${metadata.method} ${metadata.path}`);

      const fastifyRouteOptions = utils.object.omitKeys(metadata, ['path', 'method', 'schemas', 'rawBody', 'status', 'headers', 'redirect', 'render']);
      const routeOptions = { ...fastifyRouteOptions, config: { metadata } } as RouteOptions;
      routeOptions.url = metadata.path;
      routeOptions.method = metadata.method === HttpMethod.ALL ? httpMethods : [metadata.method];
      routeOptions.handler = this.generateRouteHandler(route);

      /** Applying middlewares */
      for (const middleware of middlewares) {
        const name = middleware.metatype.name;
        const { type } = middleware.metadata;
        const handler = await this.getMiddlewareHandler(middleware, metadata);
        if (typeof handler === 'function') {
          this.logger.debug(`applying '${type}' middleware '${name}'`);
          const middlewareHandler = routeOptions[type] as RouteHandler[];
          if (middlewareHandler) middlewareHandler.push(handler);
          else routeOptions[type] = [handler];
        }
      }

      routeOptions.schema = {};
      routeOptions.attachValidation = metadata.silentValidation ?? false;
      routeOptions.schema.response = merge(metadata.schemas?.response ?? {}, defaultResponseSchemas);
      if (metadata.schemas?.body) routeOptions.schema.body = metadata.schemas.body;
      if (metadata.schemas?.params) routeOptions.schema.params = metadata.schemas.params;
      if (metadata.schemas?.query) routeOptions.schema.querystring = metadata.schemas.query;
      this.logger.debug('route options', { options: routeOptions });

      this.instance.route(routeOptions);
      this.logger.info(`registered route ${metadata.method} ${routeOptions.url}`);
      if (this.childRouter && metadata.method === HttpMethod.GET) {
        const handler = this.generateChildRouteHandler(routeOptions);
        this.childRouter.on('GET', routeOptions.url, handler as any);
        this.logger.info(`registered child route ${metadata.method} ${routeOptions.url}`);
      }
    }
  }

  async start(): Promise<void> {
    const options = utils.object.pickKeys(this.config, ['port', 'host']);
    const address = await this.instance.listen(options);
    this.logger.info(`server started at ${address}`);
  }

  async stop(): Promise<void> {
    this.logger.debug('stopping server');
    await this.instance.close();
    this.logger.info('server stopped');
  }

  /**
   * Creates a new child context derived from the current one to load route-specific data
   * during SSR. Automatically reuses middleware results from the parent context to avoid
   * redundant execution and ensures correct context isolation for nested route data fetching.
   */
  async resolveChildRoute(url: string): Promise<ChildRouteResult> {
    if (!this.childRouter) throw new InternalError('Child routes are not enabled');

    const handler = this.childRouter.find('GET', url);
    if (!handler) throw new InternalError(`Child route not found for URL: ${url}`);

    const queryIndex = url.indexOf('?');
    const path = queryIndex === -1 ? url : url.substring(0, queryIndex);
    const params = handler.params as Record<string, string>;

    const request: ChildRouteRequest = { method: HttpMethod.GET, url: path, params, query: handler.searchParams };
    const response = new ChildRouteResponse();
    await handler.handler(request as any, response as any, params, {}, handler.searchParams);
    return response.getResult();
  }

  mockRequest(): MockRequestChain;
  mockRequest(options: MockRequestOptions): Promise<MockResponse>;
  mockRequest(options?: MockRequestOptions): MockRequestChain | Promise<MockResponse> {
    return options ? this.instance.inject(options) : this.instance.inject();
  }
}
