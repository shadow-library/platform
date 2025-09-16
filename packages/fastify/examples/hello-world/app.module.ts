/**
 * Importing npm packages
 */
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

export const AppModule = FastifyModule.forRoot({
  controllers: [HelloController],
});
