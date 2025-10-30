/**
 * Importing npm packages
 */
import crypto from 'node:crypto';

import { Inject } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { AsyncHttpMiddleware, HttpRequest, HttpResponse, Middleware, ServerError, ServerErrorCode } from '@shadow-library/fastify';
import { DateTime, DurationLike } from 'luxon';

/**
 * Importing user defined packages
 */
import { HTTP_CORE_CONFIGS, LOGGER_NAMESPACE } from '../constants';
import { type HttpCoreModuleOptions } from '../http-core.module';

/**
 * Defining types
 */

export interface CSRFOptions {
  expiresIn: DurationLike;
  refreshLeeway: DurationLike;
  tokenRadix: number;
  tokenLength: number;
}

interface ParsedCSRFToken {
  expiresAt: number;
  token: string;
  cookieToken?: string;
}

/**
 * Declaring the constants
 */

@Middleware({ type: 'onRequest', weight: 90 })
export class CsrfProtectionMiddleware implements AsyncHttpMiddleware {
  private readonly options: CSRFOptions;
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, CsrfProtectionMiddleware.name);

  constructor(@Inject(HTTP_CORE_CONFIGS) options: HttpCoreModuleOptions) {
    this.options = options.csrf;
  }

  private warnAndFail(message: string): never {
    this.logger.warn(message);
    throw new ServerError(ServerErrorCode.S010);
  }

  private getCSRFToken(request: HttpRequest): ParsedCSRFToken | null {
    const headerToken = request.headers['x-csrf-token'];
    if (!headerToken || Array.isArray(headerToken)) {
      this.logger.debug('No or Invalid CSRF token found in request headers');
      return null;
    }

    const csrfCookie = request.cookies['csrf-token'];
    if (!csrfCookie) {
      this.logger.debug('No CSRF token found in cookies');
      return null;
    }
    const [expiryTime, cookieToken] = csrfCookie.split(':');
    if (!expiryTime || !cookieToken) {
      this.logger.warn('Invalid CSRF token found in cookies', { expiryTime, cookieToken });
      return null;
    }

    const expiresAt = parseInt(expiryTime, this.options.tokenRadix);
    if (isNaN(expiresAt)) {
      this.logger.warn('Invalid CSRF token expiry time', { expiryTime });
      return null;
    }

    return { expiresAt, token: headerToken, cookieToken };
  }

  async use(request: HttpRequest, response: HttpResponse): Promise<void> {
    const csrfToken = this.getCSRFToken(request);
    const isMutation = request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS';

    /** Validate CSRF token for mutations */
    if (isMutation) {
      if (!csrfToken || !csrfToken.cookieToken) this.warnAndFail('CSRF token missing or malformed');
      if (csrfToken.token !== csrfToken.cookieToken) this.warnAndFail('CSRF token mismatch');
      if (Date.now() > csrfToken.expiresAt) this.warnAndFail('CSRF token expired');
      this.logger.debug('CSRF token verified successfully');
    }

    /** Set CSRF token, if not present or expired */
    let shouldSetCSRFToken = !csrfToken;
    if (csrfToken) {
      const refreshTime = DateTime.fromMillis(csrfToken.expiresAt).minus(this.options.refreshLeeway).toMillis();
      if (refreshTime < Date.now()) shouldSetCSRFToken = true;
    }

    if (shouldSetCSRFToken) {
      const expireAt = DateTime.now().plus(this.options.expiresIn);
      const csrfToken = expireAt.toMillis().toString(this.options.tokenRadix) + ':' + crypto.randomBytes(this.options.tokenLength).toString('hex');
      response.setCookie('csrf-token', csrfToken, { httpOnly: false, sameSite: 'lax', path: '/', expires: expireAt.toJSDate() });
      this.logger.debug('CSRF token set/updated', { csrfToken, expireAt });
    }
  }
}
