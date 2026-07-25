/**
 * Importing npm packages
 */
import { DynamicModule, Inject, Injectable, Module, type OnModuleInit } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ContextService, FASTIFY_INSTANCE, FastifyModule } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { type AuthClientConfig } from '../interfaces';
import { AuthClient } from '../lib/auth-client';
import { AppSessionService } from './app-session.service';
import { AuthGuard } from './auth-guard';
import { AuthController, configureAuthRoutes } from './auth.controller';
import { AuthModuleOptions, resolveAuthClientConfig, resolveAuthRoutes, resolveBrowserAuthConfig, type ResolvedBrowserAuthConfig } from './config';
import { extendContextWithAuth } from './context';

/**
 * Defining types
 */

/**
 * The slice of the Fastify instance the module needs. Typed structurally so the SDK does not have to
 * depend on `fastify` itself for one call.
 */
interface ContentTypeParserHost {
  hasContentTypeParser(contentType: string): boolean;
  addContentTypeParser(
    contentType: string,
    options: { parseAs: 'string' },
    parser: (request: unknown, body: string, done: (error: Error | null, body?: unknown) => void) => void,
  ): void;
}

/**
 * Declaring the constants
 *
 * Import `AuthModule.forRoot(...)` inside `FastifyModule.forRoot({ imports: [...] })` and the service
 * is done: the guard middleware registers against the HTTP routes, the browser-facing auth
 * controllers come with it, and on startup the module extends the app's `ContextService` with
 * principal accessors, validates the configured scopes against discovery, pushes the role catalog
 * when one is declared (roles live in code, not in hand-run admin calls), and loads the
 * admin-configured service-access rules that decide which M2M callers may reach which routes.
 */
const AUTH_CONFIG: unique symbol = Symbol('shadow-library:auth-config');
const BROWSER_CONFIG: unique symbol = Symbol('shadow-library:auth-browser-config');

/** OIDC Back-Channel Logout posts form-encoded, which Fastify does not parse out of the box */
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

@Injectable()
class AuthInitializer implements OnModuleInit {
  private readonly logger = Logger.getLogger(NAMESPACE, AuthInitializer.name);

  constructor(
    private readonly client: AuthClient,
    private readonly context: ContextService,
    @Inject(AUTH_CONFIG) private readonly config: AuthClientConfig,
    @Inject(BROWSER_CONFIG) private readonly browser: ResolvedBrowserAuthConfig,
    @Inject(FASTIFY_INSTANCE) private readonly fastify: ContentTypeParserHost,
  ) {}

  async onModuleInit(): Promise<void> {
    extendContextWithAuth(this.context);
    if (this.browser.enabled && this.browser.routes.backchannelLogout) this.registerFormParser();
    if (this.browser.enabled && this.browser.validateScopes) await this.client.assertScopesSupported(this.browser.scopes);
    if (this.config.roles) await this.client.syncRoles(this.config.roles);
    if (this.config.client) await this.client.loadServiceAccess();
    this.logger.info('auth module initialised', {
      rolesDeclared: Boolean(this.config.roles),
      serviceAccessLoaded: Boolean(this.config.client),
      browserFlow: this.browser.enabled,
    });
  }

  /** Left alone when the application already parses forms; the SDK is a guest in someone else's server */
  private registerFormParser(): void {
    if (this.fastify.hasContentTypeParser(FORM_CONTENT_TYPE)) return;
    this.fastify.addContentTypeParser(FORM_CONTENT_TYPE, { parseAs: 'string' }, (_request, body, done) => done(null, Object.fromEntries(new URLSearchParams(body))));
    this.logger.debug('registered a form-encoded body parser for the back-channel logout route');
  }
}

@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions = {}): DynamicModule {
    const config = resolveAuthClientConfig(options);
    const routes = resolveAuthRoutes(options.routes);
    const browser = resolveBrowserAuthConfig(config, routes, options.browser);
    const client = new AuthClient(config);
    const sessions = new AppSessionService(client, browser);

    /** Route metadata is settled before the registry scans the controller, so this must happen here */
    if (browser.enabled) configureAuthRoutes(routes);

    /**
     * Handed over through factories rather than `useValue`, because `@Module` deep-freezes its
     * metadata: a value provider would freeze these live objects along with it, and a frozen client
     * can no longer cache its own discovery document.
     */
    return {
      module: AuthModule,
      imports: [FastifyModule],
      controllers: browser.enabled ? [AuthGuard, AuthController] : [AuthGuard],
      providers: [
        { token: AuthClient, useFactory: () => client },
        { token: AppSessionService, useFactory: () => sessions },
        { token: AUTH_CONFIG, useFactory: () => config },
        { token: BROWSER_CONFIG, useFactory: () => browser },
        { token: AuthInitializer, useClass: AuthInitializer },
      ],
      exports: [AuthClient, AppSessionService],
    };
  }
}
