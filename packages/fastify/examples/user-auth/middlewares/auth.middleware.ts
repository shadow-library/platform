/**
 * Importing npm packages
 */
import { AsyncHttpMiddleware, ContextService, HttpRequest, Middleware } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { UserService } from '../user.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Middleware()
export class AuthMiddleware implements AsyncHttpMiddleware {
  constructor(
    private readonly userService: UserService,
    private readonly contextService: ContextService,
  ) {}

  async use(request: HttpRequest): Promise<void> {
    const userId = Number(request.headers['x-user-id']);
    if (typeof userId !== 'number' || isNaN(userId)) return;
    const user = await this.userService.getUserById(userId);
    if (user) this.contextService.set('CURRENT_USER', user);
  }
}
