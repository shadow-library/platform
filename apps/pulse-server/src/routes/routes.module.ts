/**
 * Importing npm packages
 */
import { Config } from '@shadow-library/common';
import { FastifyModule } from '@shadow-library/fastify';
import { HttpCoreModule } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [HttpCoreModule.forRoot()],

  host: Config.get('server.host'),
  port: Config.get('server.port'),
});
