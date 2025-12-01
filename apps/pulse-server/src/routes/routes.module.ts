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

const AppHttpCoreModule = HttpCoreModule.forRoot({ csrf: { disabled: true } });

export const HttpRouteModule = FastifyModule.forRoot({
  imports: [AppHttpCoreModule],

  host: Config.get('server.host'),
  port: Config.get('server.port'),
});
