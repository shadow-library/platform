/**
 * Importing npm packages
 */
import assert from 'node:assert';
import crypto from 'node:crypto';

import { AsyncHttpMiddleware, HttpRequest, HttpResponse, Middleware, ServerError, ServerErrorCode } from '@shadow-library/fastify';
import { DateTime } from 'luxon';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const CSRF_TOKEN_RADIX = 32;

@Middleware({ type: 'onRequest', weight: 90 })
export class CsrfProtectionMiddleware implements AsyncHttpMiddleware {
  async use(request: HttpRequest, response: HttpResponse): Promise<void> {
    const csrfToken = request.headers['x-csrf-token'];
    const isMutation = request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS';
    if (Array.isArray(csrfToken)) throw new ServerError(ServerErrorCode.S010);

    /** Validate CSRF token for mutations */
    if (isMutation) {
      if (!csrfToken) throw new ServerError(ServerErrorCode.S010);
      const csrfCookie = request.cookies['csrf-token'];
      if (csrfCookie !== csrfToken) throw new ServerError(ServerErrorCode.S010);
    }

    /** Set CSRF token, if not present or expired */
    let shouldSetCSRFToken = !csrfToken;
    if (csrfToken) {
      const [token, expiresAt] = csrfToken.split(':');
      assert(token && expiresAt, 'Invalid CSRF token format');
      const expiryTime = parseInt(expiresAt, CSRF_TOKEN_RADIX);
      const changeTime = DateTime.fromMillis(expiryTime).minus({ hours: 6 }).toMillis();
      if (changeTime < Date.now()) shouldSetCSRFToken = true;
    }

    if (shouldSetCSRFToken) {
      const expireAt = DateTime.now().plus({ days: 1 });
      const csrfToken = crypto.randomBytes(32).toString('hex') + ':' + expireAt.toMillis().toString(CSRF_TOKEN_RADIX);
      response.setCookie('csrf-token', csrfToken, { httpOnly: false, sameSite: 'lax', path: '/', expires: expireAt.toJSDate() });
    }
  }
}
