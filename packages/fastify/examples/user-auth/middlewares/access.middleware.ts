/**
 * Importing npm packages
 */
import { HandlerMetadata } from '@shadow-library/app';
import { AsyncRouteHandler, ContextService, Middleware, MiddlewareGenerator, ServerErrorCode } from '@shadow-library/fastify';

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

  generate(metadata: HandlerMetadata): AsyncRouteHandler | undefined {
    /* Narrowed once here so the returned handler closes over the guard options instead of re-reading the optional metadata. */
    const authGuard = metadata.authGuard;
    if (!authGuard) return;

    return async () => {
      const user = this.contextService.get<User>('CURRENT_USER');
      if (!user) throw ServerErrorCode.S004.create();
      if (authGuard.accessLevel > user.accessLevel) throw ServerErrorCode.S005.create();
    };
  }
}
