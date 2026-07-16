/**
 * Importing npm packages
 */
import { DynamicModule, Inject, Injectable, Module, type OnModuleInit } from '@shadow-library/app';
import { ContextService, FastifyModule } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { AuthGuard } from './auth-guard';
import { AuthModuleOptions, resolveAuthClientConfig } from './config';
import { extendContextWithAuth } from './context';
import { type AuthClientConfig } from '../interfaces';
import { AuthClient } from '../lib/auth-client';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Import `AuthModule.forRoot(...)` inside `FastifyModule.forRoot({ imports: [...] })` so the
 * guard middleware registers against the HTTP routes. On startup the module extends the app's
 * `ContextService` with principal accessors, pushes the role catalog when one is declared
 * (roles live in code, not in hand-run admin calls), and loads the admin-configured
 * service-access rules that decide which M2M callers may reach which routes.
 */
const AUTH_CONFIG: unique symbol = Symbol('shadow-library:auth-config');

@Injectable()
class AuthInitializer implements OnModuleInit {
  constructor(
    private readonly client: AuthClient,
    private readonly context: ContextService,
    @Inject(AUTH_CONFIG) private readonly config: AuthClientConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    extendContextWithAuth(this.context);
    if (this.config.roles) await this.client.syncRoles(this.config.roles);
    if (this.config.client) await this.client.loadServiceAccess();
  }
}

@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions = {}): DynamicModule {
    const config = resolveAuthClientConfig(options);
    const client = new AuthClient(config);
    return {
      module: AuthModule,
      imports: [FastifyModule],
      controllers: [AuthGuard],
      providers: [
        { token: AuthClient, useValue: client },
        { token: AUTH_CONFIG, useValue: config },
        { token: AuthInitializer, useClass: AuthInitializer },
      ],
      exports: [AuthClient],
    };
  }
}
