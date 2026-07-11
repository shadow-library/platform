/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';
import { ServerError } from '@shadow-library/fastify';
import { type FastifyRequest } from 'fastify';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';

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
  constructor(private readonly sessionService: SessionService) {}

  async authenticate(request: FastifyRequest): Promise<ValidatedSession> {
    const secret = request.cookies[SESSION_COOKIE_NAME];
    const session = secret ? await this.sessionService.validate(secret) : null;
    if (!session) throw new ServerError(AppErrorCode.AUTH_005);
    return session;
  }

  /** Gates sensitive operations on a recent second-factor proof (architecture §8.2 step-up). */
  async authenticateElevated(request: FastifyRequest): Promise<ValidatedSession> {
    const session = await this.authenticate(request);
    if (!this.sessionService.isElevated(session)) throw new ServerError(AppErrorCode.AUTH_006);
    return session;
  }
}
