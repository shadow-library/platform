/**
 * Importing npm packages
 */
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { KeyModule } from '@server/modules/auth/keys';
import { HealthModule } from '@server/modules/infrastructure/health';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Routes carry explicit, full paths at the controller level rather than a global
 * prefix: an identity provider mixes unprefixed root routes (`/health`,
 * `/.well-known/*`) with the versioned `/api/v1/*` surface.
 */

export const AppHttpCoreModule = HttpCoreModule.forRoot({});

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [AppHttpCoreModule, HealthModule, KeyModule],

  host: Config.get('server.host'),
  port: Config.get('server.port'),
});
