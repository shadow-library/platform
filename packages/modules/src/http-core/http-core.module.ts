import { subscribe, unsubscribe } from 'node:diagnostics_channel';

import { fastifyCookie } from '@fastify/cookie';
import { PartialDeep } from 'type-fest';
import { DynamicModule, Inject, Module, OnModuleDestroy, OnModuleInit } from '@shadow-library/app';
import { Config, LogData, Logger } from '@shadow-library/common';
import { ContextService, EventStream, FASTIFY_INSTANCE, FastifyModule, type ServerInstance } from '@shadow-library/fastify';

import { QUERY_CHANNEL } from '../internal.utils';
import { DEFAULT_CONFIGS, HTTP_CORE_CONFIGS, LOGGER_NAMESPACE } from './http-core.constants';
import { type HttpCoreModuleOptions } from './http-core.types';
import { CsrfProtectionMiddleware, RequestInitializerMiddleware } from './middlewares';
import { CSRFTokenService, HealthService, OpenApiService } from './services';

const DEFAULT_HTTP_CORE_CONFIGS = {
  csrf: {
    cookieName: 'csrf-token',
    headerName: 'x-csrf-token',
    expiresIn: { days: 1 },
    refreshLeeway: { hours: 6 },
    tokenRadix: 36,
    tokenLength: 32,
  },
  helmet: {
    global: true,
    hidePoweredBy: true,
    xContentTypeOptions: true,
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'sameorigin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: false },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        objectSrc: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: [],
        manifestSrc: ["'self'"],
      },
    },
  },
  compress: {
    global: true,
  },
  openapi: {
    routePrefix: '/dev/api-docs',
    components: { schemas: {} },
  },
} satisfies HttpCoreModuleOptions;

const REQUEST_QUERY_STATS = Symbol('request-query-stats');

interface RequestQueryStats {
  count: number;
  durationMs: number;
}

const roundMs = (value: number): number => Math.round(value * 10) / 10;

@Module()
export class HttpCoreModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, 'HttpCoreModule');
  private readonly countQuery = (durationMs: unknown): void => this.addRequestQuery(durationMs as number);

  constructor(
    @Inject(HTTP_CORE_CONFIGS) private readonly options: HttpCoreModuleOptions,
    @Inject(FASTIFY_INSTANCE) private readonly fastify: ServerInstance,
    private readonly contextService: ContextService,
    private readonly openApiService: OpenApiService,
  ) {}

  /** Registers an optional feature when enabled by code config, env config, or the environment default — in that order of precedence */
  private async setupFeature(feature: 'openapi' | 'helmet' | 'compress', fallback: boolean, setup: () => Promise<void>): Promise<void> {
    const isConfigEnabled = Config.register(`http-core.${feature}.enabled`, DEFAULT_CONFIGS[`http-core.${feature}.enabled`]);
    const isEnabled = this.options[feature].enabled ?? isConfigEnabled ?? fallback;
    if (!isEnabled) return;

    await setup();
    this.logger.info(`${feature} registered with options`, { options: this.options[feature] });
  }

  private addRequestQuery(durationMs: number): void {
    if (!this.contextService.isInitialized()) return;
    const stats = this.contextService.get<RequestQueryStats>(REQUEST_QUERY_STATS);
    if (!stats) this.contextService.set<RequestQueryStats>(REQUEST_QUERY_STATS, { count: 1, durationMs });
    else {
      stats.count++;
      stats.durationMs += durationMs;
    }
  }

  /** Logs one line per request that is slow or issues too many queries, and nothing for any other request */
  private setupRequestMetrics(): void {
    const durationThreshold = Config.register('http-core.slow-request-threshold', DEFAULT_CONFIGS['http-core.slow-request-threshold']);
    const queryThreshold = Config.register('http-core.request-query-threshold', DEFAULT_CONFIGS['http-core.request-query-threshold']);
    if (durationThreshold <= 0 && queryThreshold <= 0) return;

    subscribe(QUERY_CHANNEL, this.countQuery);
    this.fastify.addHook('onResponse', (request, reply, done) => {
      const stats = this.contextService.isInitialized() ? this.contextService.get<RequestQueryStats>(REQUEST_QUERY_STATS) : null;
      const queryCount = stats?.count ?? 0;
      const isSlow = durationThreshold > 0 && reply.elapsedTime > durationThreshold;
      const isQueryHeavy = queryThreshold > 0 && queryCount > queryThreshold;
      if ((isSlow || isQueryHeavy) && !EventStream.isStream(reply)) {
        const route = request.routeOptions.url ?? '<unmatched>';
        const durationMs = roundMs(reply.elapsedTime);
        const queryDurationMs = roundMs(stats?.durationMs ?? 0);
        const metrics = { method: request.method, route, status: reply.statusCode, durationMs, queryCount, queryDurationMs };
        this.logger.warn(
          `${isSlow ? 'Slow request' : 'Query-heavy request'} ${request.method} ${route} -> ${reply.statusCode} took ${durationMs}ms with ${queryCount} queries (${queryDurationMs}ms in db)`,
          metrics,
        );
      }
      done();
    });
  }

  async onModuleInit(): Promise<void> {
    await this.fastify.register(fastifyCookie);
    this.setupRequestMetrics();

    Logger.addContextProvider('http', () => {
      if (!this.contextService.isInitialized()) return;

      const request = this.contextService.getRequest();
      const context: LogData = {};
      context.rid = request.id;
      context.cid = request.cid;
      return context;
    });

    await this.setupFeature('openapi', Config.isDev(), async () => {
      const fastifySwagger = await import('@fastify/swagger');
      const scalar = await import('@scalar/fastify-api-reference');
      await this.fastify.register(fastifySwagger, this.openApiService.getFastifySwaggerOptions());
      await this.fastify.register(scalar.default, this.openApiService.getScalarOptions());
    });

    await this.setupFeature('helmet', Config.isProd(), async () => {
      const helmet = await import('@fastify/helmet');
      await this.fastify.register(helmet, this.options.helmet);
    });

    await this.setupFeature('compress', Config.isProd(), async () => {
      const compress = await import('@fastify/compress');
      await this.fastify.register(compress, this.options.compress);
    });
  }

  onModuleDestroy(): void {
    unsubscribe(QUERY_CHANNEL, this.countQuery);
  }

  static forRoot(options: PartialDeep<HttpCoreModuleOptions> = {}): DynamicModule {
    const httpCoreOptions: Record<string, any> = { ...DEFAULT_HTTP_CORE_CONFIGS };
    for (const key in options) httpCoreOptions[key] = { ...httpCoreOptions[key], ...(options as Record<string, any>)[key] };
    const HttpCoreProvider = { token: HTTP_CORE_CONFIGS, useValue: httpCoreOptions };

    return {
      module: HttpCoreModule,
      imports: [FastifyModule],
      providers: [CSRFTokenService, OpenApiService, HealthService, HttpCoreProvider],
      controllers: [RequestInitializerMiddleware, CsrfProtectionMiddleware],
      exports: [CSRFTokenService],
    };
  }
}
