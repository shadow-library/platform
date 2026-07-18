/**
 * Importing npm packages
 */
import { type DynamicModule, Module } from '@shadow-library/app';
import { createAuthClient } from '@shadow-library/auth';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME } from '@server/constants';

import { AUTH_CLIENT } from './auth.constants';
import { AuthGuard } from './auth.guard';
import { RouteGuardSentinel } from './route-guard.sentinel';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Provides the SDK auth client behind a factory provider so it is constructed at DI-init time,
 * reading config then rather than at module-import time. That lets tests point the guard at a
 * per-file mock IdP before the application initialises. Must be imported inside
 * `FastifyModule.forRoot(...)` so the guard and sentinel register against the HTTP routes.
 */

@Module({})
export class AuthModule {
  static forRoot(): DynamicModule {
    return {
      module: AuthModule,
      controllers: [AuthGuard, RouteGuardSentinel],
      providers: [
        {
          token: AUTH_CLIENT,
          useFactory: () => {
            const logger = Logger.getLogger(APP_NAME, AuthModule.name);
            const config = {
              issuer: Config.get('auth.issuer'),
              audience: Config.get('auth.audience'),
              client: { id: Config.get('auth.client-id'), secret: Config.get('auth.client-secret') },
              identityResource: Config.get('auth.identity-resource'),
            };
            /** The client secret is a live credential and is never logged; only its presence is. */
            logger.debug('Initialising auth client', {
              issuer: config.issuer,
              audience: config.audience,
              identityResource: config.identityResource,
              clientId: config.client.id,
              clientSecretSet: Boolean(config.client.secret),
            });
            return createAuthClient(config);
          },
        },
      ],
      exports: [AUTH_CLIENT],
    };
  }
}
