/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { SESSION_COOKIE_NAME } from './session.constants';
import { SessionService, ValidatedSession } from './session.service';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/**
 * Resolves the `__Host-sid` cookie to a live session for first-party authenticated endpoints
 * (`/me/*`). OAuth bearer tokens are deliberately not accepted here: account and credential
 * management is reserved for direct, session-holding browsers (D-10).
 */
@Injectable()
export class SessionAuthService {
  private readonly logger = Logger.getLogger(APP_NAME, SessionAuthService.name);

  constructor(private readonly sessionService: SessionService) {}

  async authenticate(request: FastifyRequest): Promise<ValidatedSession> {
    const secret = request.cookies[SESSION_COOKIE_NAME];
    /** The two failure modes are logged distinctly (never the secret itself) so an auth 401 can be traced to a cause. */
    if (!secret) {
      this.logger.debug('session authentication failed: no session cookie present');
      throw new ServerError(AppErrorCode.AUTH_005);
    }
    const session = await this.sessionService.validate(secret);
    if (!session) {
      this.logger.debug('session authentication failed: cookie did not resolve to a live session');
      throw new ServerError(AppErrorCode.AUTH_005);
    }
    this.logger.debug('session authenticated', { userId: session.userId.toString(), aal: session.aal });
    return session;
  }

  /** Gates sensitive operations on a recent second-factor proof (architecture §8.2 step-up). */
  async authenticateElevated(request: FastifyRequest): Promise<ValidatedSession> {
    const session = await this.authenticate(request);
    if (!this.sessionService.isElevated(session)) {
      this.logger.debug('elevated authentication rejected: session lacks a recent step-up', { userId: session.userId.toString(), aal: session.aal });
      throw new ServerError(AppErrorCode.AUTH_006);
    }
    return session;
  }
}
