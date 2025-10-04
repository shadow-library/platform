/**
 * Importing npm packages
 */
import { RouteMetadata } from '@shadow-library/app';
import { AsyncRouteHandler, ContextService, Middleware, MiddlewareGenerator, ServerError, ServerErrorCode } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { User } from '../user.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Middleware()
export class AccessMiddleware implements MiddlewareGenerator {
  constructor(private readonly contextService: ContextService) {}

  generate(metadata: RouteMetadata): AsyncRouteHandler | undefined {
    if (!metadata.authGuard) return;

    return async () => {
      const user = this.contextService.get<User>('CURRENT_USER');
      if (!user) throw new ServerError(ServerErrorCode.S004);
      if (metadata.authGuard!.accessLevel > user.accessLevel) throw new ServerError(ServerErrorCode.S005);
    };
  }
}
