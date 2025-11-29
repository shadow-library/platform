/**
 * Importing npm packages
 */
import { fastifyCookie } from '@fastify/cookie';
import { DynamicModule, Inject, Module, OnModuleInit } from '@shadow-library/app';
import { Config, LogData, Logger } from '@shadow-library/common';
import { ContextService, FASTIFY_INSTANCE, FastifyModule, type ServerInstance } from '@shadow-library/fastify';
import { PartialDeep } from 'type-fest';

/**
 * Importing user defined packages
 */
import { HealthController } from './controllers/health.controller';
import { HTTP_CORE_CONFIGS } from './http-core.constants';
import { type HttpCoreModuleOptions } from './http-core.types';
import { CsrfProtectionMiddleware, RequestInitializerMiddleware } from './middlewares';
import { CSRFTokenService } from './services';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const DEFAULT_HTTP_CORE_CONFIGS: HttpCoreModuleOptions = {
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
  compress: { global: true },
  openapi: {
    info: { title: Config.get('app.name'), version: '1.0.0' },
    components: {},
  },
};

@Module()
export class HttpCoreModule implements OnModuleInit {
  constructor(
    @Inject(HTTP_CORE_CONFIGS) private readonly options: HttpCoreModuleOptions,
    @Inject(FASTIFY_INSTANCE) private readonly fastify: ServerInstance,
    private readonly contextService: ContextService,
  ) {
    Config.load('http-core.csrf.enabled', { defaultValue: 'true' });
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

    if (Config.isDev()) {
      const fastifySwagger = await import('@fastify/swagger');
      const scalar = await import('@scalar/fastify-api-reference');

      await this.fastify.register(fastifySwagger, { openapi: this.options.openapi });
      await this.fastify.register(scalar.default, { routePrefix: '/dev/api-docs' });
    }

    if (Config.isProd()) {
      const helmet = await import('@fastify/helmet');
      const compress = await import('@fastify/compress');

      await this.fastify.register(helmet, this.options.helmet);
      await this.fastify.register(compress, this.options.compress);
    }
  }

  static forRoot(options: PartialDeep<HttpCoreModuleOptions> = {}): DynamicModule {
    const httpCoreOptions: Record<string, any> = { ...DEFAULT_HTTP_CORE_CONFIGS };
    for (const key in options) httpCoreOptions[key] = { ...httpCoreOptions[key], ...(options as Record<string, any>)[key] };

    return {
      module: HttpCoreModule,
      imports: [FastifyModule],
      providers: [CSRFTokenService, { token: HTTP_CORE_CONFIGS, useValue: httpCoreOptions }],
      controllers: [HealthController, RequestInitializerMiddleware, CsrfProtectionMiddleware],
      exports: [CSRFTokenService],
    };
  }
}
