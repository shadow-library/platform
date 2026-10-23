import { DynamicModule, Inject, Injectable, Module, type OnModuleDestroy, type OnModuleInit } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ContextService, FASTIFY_INSTANCE, FastifyModule } from '@shadow-library/fastify';

import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { type AuthClientConfig } from '../interfaces';
import { AuthClient } from '../lib/auth-client';
import { AuthAccessPolicy } from './access-policy';
import { AppSessionService } from './app-session.service';
import { AuthGuard } from './auth-guard';
import { AuthController, configureAuthRoutes } from './auth.controller';
import { AuthModuleOptions, resolveAccessMode, resolveAuthClientConfig, resolveAuthRoutes, resolveBrowserAuthConfig, type ResolvedBrowserAuthConfig } from './config';
import { extendContextWithAuth } from './context';

// Typed structurally so the SDK need not depend on `fastify` itself for one call
interface ContentTypeParserHost {
  hasContentTypeParser(contentType: string): boolean;
  addContentTypeParser(
    contentType: string,
    options: { parseAs: 'string' },
    parser: (request: unknown, body: string, done: (error: Error | null, body?: unknown) => void) => void,
  ): void;
}

const AUTH_CONFIG: unique symbol = Symbol('shadow-library:auth-config');
const BROWSER_CONFIG: unique symbol = Symbol('shadow-library:auth-browser-config');

/** OIDC Back-Channel Logout posts form-encoded, which Fastify does not parse out of the box */
const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded';

function assertSignInReachable(browser: ResolvedBrowserAuthConfig): void {
  const fail = (cause: string): never => {
    throw AuthErrorCode.CONFIG_INVALID.create({ reason: `access mode is private but ${cause}, so nobody could ever sign in` });
  };

  if (!browser.enabled) fail('the browser sign-in flow is off (it needs a client credential and browser login enabled)');
  const disabled = (['login', 'callback'] as const).filter(route => !browser.routes[route]);
  if (disabled.length > 0) fail(`the ${disabled.join(' and ')} route${disabled.length > 1 ? 's are' : ' is'} disabled`);
}

@Injectable()
class AuthInitializer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = Logger.getLogger(NAMESPACE, AuthInitializer.name);

  constructor(
    private readonly client: AuthClient,
    private readonly sessions: AppSessionService,
    private readonly context: ContextService,
    private readonly accessPolicy: AuthAccessPolicy,
    @Inject(AUTH_CONFIG) private readonly config: AuthClientConfig,
    @Inject(BROWSER_CONFIG) private readonly browser: ResolvedBrowserAuthConfig,
    @Inject(FASTIFY_INSTANCE) private readonly fastify: ContentTypeParserHost,
  ) {}

  async onModuleInit(): Promise<void> {
    extendContextWithAuth(this.context);
    if (this.browser.enabled && this.browser.routes.backchannelLogout) this.registerFormParser();

    // Audience, redirect uri and scopes come from identity, so this is the first moment a misconfiguration can be a boot failure rather than a 401 on a user's first login
    if (this.browser.enabled) await this.sessions.warmUp();

    // Never forced: overriding identity's destructive-sync guardrail on every boot would defeat it
    if (this.config.roles) await this.client.syncRoles(this.config.roles);
    if (this.config.client) await this.client.loadServiceAccess();
    this.logger.info('auth module initialised', {
      appId: this.config.appId,
      rolesDeclared: Boolean(this.config.roles),
      serviceAccessLoaded: Boolean(this.config.client),
      browserFlow: this.browser.enabled,
      accessMode: this.accessPolicy.mode,
    });
  }

  onModuleDestroy(): void {
    this.client.stop();
  }

  // Left alone when the application already parses forms
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
    const accessPolicy = new AuthAccessPolicy(resolveAccessMode(options));
    if (accessPolicy.isPrivate()) assertSignInReachable(browser);

    const client = new AuthClient(config);
    const sessions = new AppSessionService(client, browser);

    if (browser.enabled) configureAuthRoutes(routes);

    // Factories, not `useValue`: `@Module` deep-freezes its metadata, and a frozen client can no longer cache its discovery document
    return {
      module: AuthModule,
      imports: [FastifyModule],
      controllers: browser.enabled ? [AuthGuard, AuthController] : [AuthGuard],
      providers: [
        { token: AuthClient, useFactory: () => client },
        { token: AppSessionService, useFactory: () => sessions },
        { token: AUTH_CONFIG, useFactory: () => config },
        { token: BROWSER_CONFIG, useFactory: () => browser },
        { token: AuthAccessPolicy, useFactory: () => accessPolicy },
        { token: AuthInitializer, useClass: AuthInitializer },
      ],
      exports: [AuthClient, AppSessionService, AuthAccessPolicy],
    };
  }
}
