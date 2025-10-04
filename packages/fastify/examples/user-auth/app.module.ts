/**
 * Importing npm packages
 */
import { FastifyModule } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { UserController } from './user.controller';
import { AuthMiddleware } from './middlewares/auth.middleware';
import { AccessMiddleware } from './middlewares/access.middleware';
import { UserService } from './user.service';
import { HealthController } from './health.controller';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const AppModule = FastifyModule.forRoot({
  controllers: [HealthController, UserController, AuthMiddleware, AccessMiddleware],
  providers: [UserService],
});
