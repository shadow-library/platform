/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { type HttpRequest, Middleware } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { SESSION_COOKIE, SessionService } from './session.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Bridges the first-party session cookie onto the standard bearer surface: when a request carries
 * the session cookie and no Authorization header, the sealed access token is promoted into the
 * header so the package `AuthGuard` (weight 100) verifies it exactly like any API client's token.
 * Runs before the guard — higher weight executes first within the same hook.
 */

@Middleware({ type: 'preHandler', weight: 150 })
export class SessionCookieMiddleware {
  constructor(private readonly sessionService: SessionService) {}

  async use(request: HttpRequest): Promise<void> {
    if (request.headers.authorization) return;
    const accessToken = this.sessionService.peekAccessToken(request.cookies?.[SESSION_COOKIE]);
    if (accessToken) request.headers.authorization = `Bearer ${accessToken}`;
  }
}
