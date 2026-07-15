/**
 * Importing npm packages
 */
import { DynamicModule, Inject, Injectable, Module, type OnModuleInit, Provider } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AuthGuard } from './auth-guard';
import { AUTH_CLIENT } from './constants';
import  { type AuthClientConfig, type RoleCatalogManifest } from '../interfaces';
import { createAuthClient } from '../lib/auth-client';
import  { type AuthClient } from '../lib/auth-client';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Import `AuthModule.forRoot(...)` inside `FastifyModule.forRoot({ imports: [...] })` so the
 * guard middleware registers against the HTTP routes. When `config.roles` is set, the module also
 * pushes the application's role catalog to identity on startup so roles live in code, not in hand-
 * run admin calls.
 */
const AUTH_ROLE_MANIFEST: unique symbol = Symbol('shadow-library:auth-role-manifest');

@Injectable()
class AuthRoleInitializer implements OnModuleInit {
  constructor(
    @Inject(AUTH_CLIENT) private readonly client: AuthClient,
    @Inject(AUTH_ROLE_MANIFEST) private readonly manifest: RoleCatalogManifest,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.client.syncRoles(this.manifest);
  }
}

@Module({})
export class AuthModule {
  static forRoot(config: AuthClientConfig): DynamicModule {
    const client = createAuthClient(config);
    const providers: Provider[] = [{ token: AUTH_CLIENT, useValue: client }];
    if (config.roles) providers.push({ token: AUTH_ROLE_MANIFEST, useValue: config.roles }, { token: AuthRoleInitializer, useClass: AuthRoleInitializer });
    return {
      module: AuthModule,
      controllers: [AuthGuard],
      providers,
      exports: [AUTH_CLIENT],
    };
  }
}
