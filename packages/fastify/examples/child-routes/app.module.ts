/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
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

@Module({
  imports: [
    FastifyModule.forRoot({
      enableChildRoutes: true,
      controllers: [RoutesController],
    }),
  ],
})
export class AppModule {}
