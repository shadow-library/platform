/**
 * Importing npm packages
 */
import { fastifyCookie } from '@fastify/cookie';
import { PartialDeep } from 'type-fest';
import { DynamicModule, Inject, Module, OnModuleInit } from '@shadow-library/app';
import { Config, LogData, Logger } from '@shadow-library/common';
import { ContextService, FASTIFY_INSTANCE, FastifyModule, type ServerInstance } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { DEFAULT_CONFIGS, HTTP_CORE_CONFIGS, LOGGER_NAMESPACE } from './http-core.constants';
import { type HttpCoreModuleOptions } from './http-core.types';
import { CsrfProtectionMiddleware, RequestInitializerMiddleware } from './middlewares';
import { CSRFTokenService, HealthService, OpenApiService } from './services';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
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
    info: { title: Config.get('app.name'), version: '1.0.0' },
    components: { schemas: {} },
  },
} satisfies HttpCoreModuleOptions;

@Module()
export class HttpCoreModule implements OnModuleInit {
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, 'HttpCoreModule');

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

  async onModuleInit(): Promise<void> {
    await this.fastify.register(fastifyCookie);

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
