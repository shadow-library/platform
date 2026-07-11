/**
 * Importing npm packages
 */
import { DynamicModule, Module } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { AuthClientConfig } from '../interfaces';
import { AuthGuard } from './auth-guard';
import { AUTH_CLIENT } from './constants';
import { createAuthClient } from '../lib/auth-client';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Import `AuthModule.forRoot(...)` inside `FastifyModule.forRoot({ imports: [...] })` so the
 * guard middleware registers against the HTTP routes.
 */

@Module({})
export class AuthModule {
  static forRoot(config: AuthClientConfig): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthGuard],
      providers: [{ token: AUTH_CLIENT, useValue: createAuthClient(config) }],
      exports: [AUTH_CLIENT],
    };
  }
}
