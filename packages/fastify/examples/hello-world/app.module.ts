/**
 * Importing npm packages
 */
import { Module } from '@shadow-library/app';
import { FastifyModule } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { HelloController } from './hello.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Module({
  imports: [
    FastifyModule.forRoot({
      controllers: [HelloController],
      routePrefix: 'api',
    }),
  ],
})
export class AppModule {}
