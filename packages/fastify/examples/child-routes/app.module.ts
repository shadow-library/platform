/**
 * Importing npm packages
 */
import { FastifyModule } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { RoutesController } from './routes.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const AppModule = FastifyModule.forRoot({
  enableChildRoutes: true,
  controllers: [RoutesController],
});
