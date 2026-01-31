/**
 * Importing npm packages
 */
import { fastifyCookie } from '@fastify/cookie';
import { DynamicModule, Inject, Module, OnModuleInit } from '@shadow-library/app';
import { Config, InternalError, LogData, Logger } from '@shadow-library/common';
import { ContextService, FASTIFY_INSTANCE, FastifyModule, type ServerInstance } from '@shadow-library/fastify';
import { PartialDeep } from 'type-fest';

/**
 * Importing user defined packages
 */
import { HealthController } from './controllers/health.controller';
import { HTTP_CORE_CONFIGS } from './http-core.constants';
import { type HttpCoreModuleOptions } from './http-core.types';
import { CsrfProtectionMiddleware, RequestInitializerMiddleware } from './middlewares';
import { CSRFTokenService, OpenApiService } from './services';

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
        defaultSrc: ['self'],
        baseUri: ['self'],
        scriptSrc: ['self'],
        styleSrc: ['self'],
        objectSrc: ['none'],
        formAction: ['self'],
        upgradeInsecureRequests: [],
        manifestSrc: ['self'],
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
  constructor(
    @Inject(HTTP_CORE_CONFIGS) private readonly options: HttpCoreModuleOptions,
    @Inject(FASTIFY_INSTANCE) private readonly fastify: ServerInstance,
    private readonly contextService: ContextService,
    private readonly openApiService: OpenApiService,
  ) {
    Config.load('http-core.csrf.enabled', { validateType: 'boolean', defaultValue: 'true' });
    Config.load('http-core.helmet.enabled', { validateType: 'boolean' });
    Config.load('http-core.compress.enabled', { validateType: 'boolean' });
    Config.load('http-core.openapi.enabled', { validateType: 'boolean' });
  }

  private firstDefined(...values: (boolean | undefined)[]): boolean {
    const value = values.find(v => typeof v === 'boolean');
    if (value === undefined) throw new InternalError('No defined boolean value found in firstDefined');
    return value;
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

    const isOpenapiEnabled = this.firstDefined(this.options.openapi.enabled, Config.get('http-core.openapi.enabled'), Config.isDev());
    if (isOpenapiEnabled) {
      const fastifySwagger = await import('@fastify/swagger');
      const scalar = await import('@scalar/fastify-api-reference');

      await this.fastify.register(fastifySwagger, this.openApiService.getFastifySwaggerOptions());
      await this.fastify.register(scalar.default, this.openApiService.getScalarOptions());
    }

    const isHelmetEnabled = this.firstDefined(this.options.helmet.enabled, Config.get('http-core.helmet.enabled'), Config.isProd());
    if (isHelmetEnabled) {
      const helmet = await import('@fastify/helmet');
      await this.fastify.register(helmet, this.options.helmet);
    }

    const isCompressEnabled = this.firstDefined(this.options.compress.enabled, Config.get('http-core.compress.enabled'), Config.isProd());
    if (isCompressEnabled) {
      const compress = await import('@fastify/compress');
      await this.fastify.register(compress, this.options.compress);
    }
  }

  static forRoot(options: PartialDeep<HttpCoreModuleOptions> = {}): DynamicModule {
    const httpCoreOptions: Record<string, any> = { ...DEFAULT_HTTP_CORE_CONFIGS };
    for (const key in options) httpCoreOptions[key] = { ...httpCoreOptions[key], ...(options as Record<string, any>)[key] };

    return {
      module: HttpCoreModule,
      imports: [FastifyModule],
      providers: [CSRFTokenService, OpenApiService, { token: HTTP_CORE_CONFIGS, useValue: httpCoreOptions }],
      controllers: [HealthController, RequestInitializerMiddleware, CsrfProtectionMiddleware],
      exports: [CSRFTokenService],
    };
  }
}
