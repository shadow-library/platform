/**
 * Importing npm packages
 */
import assert from 'node:assert';

import { ControllerRouteMetadata, Inject, Injectable, RouteMetadata, Router } from '@shadow-library/app';
import { ClassSchema, JSONSchema, ParsedSchema, SchemaClass, Transformer, TransformerAction, TransformerFactory } from '@shadow-library/class-schema';
import { Fn, InternalError, Logger, MaybeUndefined, SyncFn, utils } from '@shadow-library/common';
import { all as deepmerge } from 'deepmerge';
import { type FastifyInstance, RouteOptions, preHandlerAsyncHookHandler, preSerializationAsyncHookHandler } from 'fastify';
import findMyWay, { Instance as ChildRouter, HTTPVersion } from 'find-my-way';
import stringify from 'json-stable-stringify';
import { Chain as MockRequestChain, InjectOptions as MockRequestOptions, Response as MockResponse } from 'light-my-request';
import { Class, JsonObject, JsonValue, Promisable } from 'type-fest';

/**
 * Importing user defined packages
 */
import { FASTIFY_CONFIG, FASTIFY_INSTANCE, HTTP_CONTROLLER_INPUTS, HTTP_CONTROLLER_TYPE, NAMESPACE } from '../constants';
import { HttpMethod, MiddlewareMetadata, MiddlewareType, SensitiveDataType } from '../decorators';
import { AsyncRouteHandler, CallbackRouteHandler, HttpRequest, HttpResponse, ServerMetadata } from '../interfaces';
import { ContextService } from '../services';
import { INBUILT_TRANSFORMERS } from './data-transformers';
import { type FastifyConfig } from './fastify-module.interface';

/**
 * Defining types
 */

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }

  interface FastifyContextConfig {
    metadata?: ServerMetadata;
    artifacts?: RouteArtifacts;
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

interface Transformers {
  body?: Transformer;
  query?: Transformer;
  params?: Transformer;
  response?: Record<string, Transformer>;
}

interface RouteArtifacts {
  masks: Partial<Record<'body' | 'query' | 'params', Transformer>>;
  transformers: Transformers;
}

/**
 * Declaring the constants
 */
const httpMethods = Object.values(HttpMethod).filter(m => m !== HttpMethod.ALL) as Exclude<HttpMethod, HttpMethod.ALL>[];
const DEFAULT_ARTIFACTS: RouteArtifacts = { masks: {}, transformers: {} };
const isClassSchema = (schema: object): schema is SchemaClass => typeof schema === 'function' || (Array.isArray(schema) && typeof schema[0] === 'function');

@Injectable()
export class FastifyRouter extends Router {
  static override readonly name = 'FastifyRouter';

  private readonly logger = Logger.getLogger(NAMESPACE, 'FastifyRouter');
  private readonly cachedDynamicMiddlewares = new Map<string, MiddlewareHandler>();
  private readonly childRouter: ChildRouter<HTTPVersion.V1> | null = null;

  private readonly transformers: Record<string, SyncFn> = { ...INBUILT_TRANSFORMERS };
  private readonly sensitiveTransformer = new TransformerFactory(s => s['x-fastify']?.sensitive === true);
  private readonly inputDataTransformer = new TransformerFactory(s => this.isTransformable('input', s));
  private readonly outputDataTransformer = new TransformerFactory(s => this.isTransformable('output', s));

  constructor(
    @Inject(FASTIFY_CONFIG) private readonly config: FastifyConfig,
    @Inject(FASTIFY_INSTANCE) private readonly instance: FastifyInstance,
    private readonly context: ContextService,
  ) {
    super();
    if (config.transformers) Object.assign(this.transformers, config.transformers);
    if (config.enableChildRoutes) {
      const options = utils.object.pickKeys(config, ['ignoreTrailingSlash', 'ignoreDuplicateSlashes', 'allowUnsafeRegex', 'caseSensitive', 'maxParamLength', 'querystringParser']);
      this.childRouter = findMyWay(options);
    }
  }

  getInstance(): FastifyInstance {
    return this.instance;
  }

  private isTransformable(type: 'input' | 'output', schema: JSONSchema): boolean {
    const transformerType = schema['x-fastify']?.transform?.[type];
    return typeof transformerType === 'string' && transformerType in this.transformers;
  }

  private joinPaths(...parts: MaybeUndefined<string>[]): string {
    const path = parts
      .filter(p => typeof p === 'string')
      .map(p => p.replace(/^\/+|\/+$/g, ''))
      .filter(Boolean)
      .join('/');
    return `/${path}`;
  }

  private addRouteHandler(routeOptions: RouteOptions, hook: MiddlewareType, handler: Fn, action: 'prepend' | 'append' = 'append'): void {
    const existingHandlers = Array.isArray(routeOptions[hook]) ? routeOptions[hook] : routeOptions[hook] ? [routeOptions[hook]] : [];
    if (action === 'prepend') routeOptions[hook] = [handler, ...existingHandlers];
    else routeOptions[hook] = [...existingHandlers, handler];
  }

  private registerRawBody(): void {
    const opts = { parseAs: 'buffer' as const };
    const parser = this.instance.getDefaultJsonParser('error', 'error');
    this.instance.addContentTypeParser<Buffer>('application/json', opts, (req, body, done) => {
      const { metadata } = req.routeOptions.config;
      if (metadata?.rawBody) req.rawBody = body;
      return parser(req, body.toString(), done);
    });
  }

  private maskField(value: unknown, schema: JSONSchema): string {
    const type = schema['x-fastify']?.type as MaybeUndefined<SensitiveDataType>;
    const stringified = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (type === 'email') return utils.string.maskEmail(stringified);
    if (type === 'number') return utils.string.maskNumber(stringified);
    if (type === 'words') return utils.string.maskWords(stringified);
    return '****';
  }

  private generateDataTransformer(type: 'input' | 'output'): TransformerAction {
    return (value, schema) => {
      const transformType = schema['x-fastify']?.transform?.[type] as string;
      const transformer = this.transformers[transformType];
      assert(transformer, `transformer '${transformType}' not found`);
      return transformer(value);
    };
  }

  private getRequestLogger(): CallbackRouteHandler {
    const mask = this.maskField.bind(this);
    return (req, res, done) => {
      const startTime = process.hrtime();

      res.raw.on('finish', () => {
        const isLoggingDisabled = this.context.get('DISABLE_REQUEST_LOGGING') ?? false;
        if (isLoggingDisabled) return;

        const { url, config } = req.routeOptions;
        const { masks } = config.artifacts ?? DEFAULT_ARTIFACTS;
        const metadata: RequestMetadata = {};
        metadata.rid = this.context.getRID();
        metadata.url = url ?? req.raw.url;
        metadata.method = req.method;
        metadata.status = res.statusCode;
        metadata.service = req.headers['x-service'] as string | undefined;
        metadata.reqLen = req.headers['content-length'];
        metadata.reqIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
        metadata.resLen = res.getHeader('content-length') as string;

        const resTime = process.hrtime(startTime);
        metadata.timeTaken = (resTime[0] * 1e3 + resTime[1] * 1e-6).toFixed(3); // Converting time to milliseconds
        if (req.body) metadata.body = masks.body ? masks.body(structuredClone(req.body), mask) : req.body;
        if (req.query) metadata.query = masks.query ? masks.query(structuredClone(req.query), mask) : req.query;
        if (req.params) metadata.params = masks.params ? masks.params(structuredClone(req.params), mask) : req.params;
        this.logger.http(`${req.method} ${metadata.url} -> ${res.statusCode} (${metadata.timeTaken}ms)`, metadata);
      });

      done();
    };
  }

  private parseControllers(controllers: ControllerRouteMetadata[]): ParsedControllers {
    const parsedControllers: ParsedControllers = { middlewares: [], routes: [] };
    for (const controller of controllers) {
      switch (controller.metadata[HTTP_CONTROLLER_TYPE]) {
        case 'router': {
          const { instance, metadata, metatype } = controller;
          for (const route of controller.routes) {
            const version = route.metadata.version ?? 1;
            const versionPrefix = this.config.prefixVersioning ? `/v${version}` : '';
            const path = this.joinPaths(this.config.routePrefix, versionPrefix, metadata.path, route.metadata.path);
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

  private generateRouteHandler(route: ParsedController<ServerMetadata>): AsyncRouteHandler {
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

  private transformResponseHandler(): preSerializationAsyncHookHandler {
    const transform = this.generateDataTransformer('output');

    return async (request, reply, payload) => {
      const statusCode = String(reply.statusCode);
      const responseTransformers = request.routeOptions.config.artifacts?.transformers.response;
      if (!responseTransformers) return payload;

      let transformer = responseTransformers[statusCode];
      if (!transformer) {
        const fallbackStatus = statusCode.charAt(0) + 'xx';
        transformer = responseTransformers[fallbackStatus];
        this.logger.debug(`using fallback response transformer for status code ${statusCode}`, { fallbackStatus });
      }

      if (transformer) {
        this.logger.debug(`transforming response for status code ${statusCode}`);
        const cloned = deepmerge([{}, payload as object]);
        const data = transformer(cloned, transform);
        this.logger.debug(`transformed response for status code ${statusCode}`, { data });
        return data;
      }

      return payload;
    };
  }

  private transformRequestHandler(): preHandlerAsyncHookHandler {
    const transform = this.generateDataTransformer('input');

    return async request => {
      const transformers = request.routeOptions.config.artifacts?.transformers;
      if (!transformers) return;

      if (transformers.body && request.body) {
        this.logger.debug('transforming request body', { body: request.body });
        request.body = transformers.body(request.body as object, transform);
        this.logger.debug('transformed request body', { body: request.body });
      }

      if (transformers.query && request.query) {
        this.logger.debug('transforming request query', { query: request.query });
        request.query = transformers.query(request.query as object, transform);
        this.logger.debug('transformed request query', { query: request.query });
      }

      if (transformers.params && request.params) {
        this.logger.debug('transforming request params', { params: request.params });
        request.params = transformers.params(request.params as object, transform);
        this.logger.debug('transformed request params', { params: request.params });
      }
    };
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
      const artifacts: RouteArtifacts = { masks: {}, transformers: {} };
      const routeOptions = { ...fastifyRouteOptions, config: { metadata, artifacts } } as RouteOptions;
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
          this.addRouteHandler(routeOptions, type, handler);
        }
      }

      const responseSchemas = { ...defaultResponseSchemas };
      routeOptions.schema = { response: responseSchemas };
      routeOptions.attachValidation = metadata.silentValidation ?? false;
      const { body: bodySchema, params: paramsSchema, query: querySchema, response: responseSchema } = metadata.schemas ?? {};
      const isMaskEnabled = this.config.maskSensitiveData ?? true;

      if (bodySchema) {
        const schema = isClassSchema(bodySchema) ? ClassSchema.generate(bodySchema) : bodySchema;
        routeOptions.schema.body = schema;
        if (ClassSchema.isBranded(schema)) {
          const bodyTransformer = this.inputDataTransformer.maybeCompile(schema as ParsedSchema);
          if (bodyTransformer) artifacts.transformers.body = bodyTransformer;
          if (isMaskEnabled) {
            const transformer = this.sensitiveTransformer.maybeCompile(schema as ParsedSchema);
            if (transformer) artifacts.masks.body = transformer;
          }
        }
      }

      if (paramsSchema) {
        const schema = isClassSchema(paramsSchema) ? ClassSchema.generate(paramsSchema) : paramsSchema;
        routeOptions.schema.params = schema;
        if (ClassSchema.isBranded(schema)) {
          const paramsTransformer = this.inputDataTransformer.maybeCompile(schema as ParsedSchema);
          if (paramsTransformer) artifacts.transformers.params = paramsTransformer;
          if (isMaskEnabled) {
            const transformer = this.sensitiveTransformer.maybeCompile(schema as ParsedSchema);
            if (transformer) artifacts.masks.params = transformer;
          }
        }
      }

      if (querySchema) {
        const schema = isClassSchema(querySchema) ? ClassSchema.generate(querySchema) : querySchema;
        routeOptions.schema.querystring = schema;
        if (ClassSchema.isBranded(schema)) {
          const queryTransformer = this.inputDataTransformer.maybeCompile(schema as ParsedSchema);
          if (queryTransformer) artifacts.transformers.query = queryTransformer;
          if (isMaskEnabled) {
            const transformer = this.sensitiveTransformer.maybeCompile(schema as ParsedSchema);
            if (transformer) artifacts.masks.query = transformer;
          }
        }
      }

      if (responseSchema) {
        const responseTransformers: Record<string, Transformer> = {};
        artifacts.transformers.response = responseTransformers;
        for (const [code, schemaDef] of Object.entries(responseSchema)) {
          const statusCode = code.toLowerCase();
          const schema = isClassSchema(schemaDef) ? ClassSchema.generate(schemaDef) : schemaDef;
          responseSchemas[statusCode] = schema;
          if (ClassSchema.isBranded(schema)) {
            const transformer = this.outputDataTransformer.maybeCompile(schema as ParsedSchema);
            if (transformer) responseTransformers[statusCode] = transformer;
          }
        }

        if (Object.keys(responseTransformers).length > 0) {
          const handler = this.transformResponseHandler();
          this.addRouteHandler(routeOptions, 'preSerialization', handler);
        }
      }

      if ('body' in artifacts.transformers || 'query' in artifacts.transformers || 'params' in artifacts.transformers) {
        const handler = this.transformRequestHandler();
        this.addRouteHandler(routeOptions, 'preHandler', handler, 'prepend');
      }

      this.logger.debug('route options', { options: routeOptions });
      this.instance.route(routeOptions);
      this.logger.info(`registered route ${metadata.method} ${routeOptions.url}`);
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
  async resolveChildRoute<T extends JsonValue = JsonObject>(url: string, headers: Record<string, string> = {}): Promise<T> {
    if (!this.childRouter) throw new InternalError('Child routes are not enabled');
    const childHeaders = this.config.childRouteHeaders?.(this.context) ?? {};
    Object.assign(headers, childHeaders, { 'x-service': 'internal-child-route' });
    const response = await this.instance.inject({ method: 'GET', url, headers });
    return response.json() as T;
  }

  mockRequest(): MockRequestChain;
  mockRequest(options: MockRequestOptions): Promise<MockResponse>;
  mockRequest(options?: MockRequestOptions): MockRequestChain | Promise<MockResponse> {
    return options ? this.instance.inject(options) : this.instance.inject();
  }
}
