import { AsyncHttpMiddleware, ContextService, HttpRequest, Middleware } from '@shadow-library/fastify';

import { UserService } from '../user.service';

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
