/**
 * Importing npm packages
 */
import crypto from 'node:crypto';

import { DateTime } from 'luxon';
import { Inject, Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { HttpRequest } from '@shadow-library/fastify';

/**
 * Importing user defined packages
 */
import { HTTP_CORE_CONFIGS, LOGGER_NAMESPACE } from '../http-core.constants';
import { type HttpCoreModuleOptions } from '../http-core.types';
import { type CSRFCookie, type CSRFOptions } from './csrf-token.types';

/**
 * Defining types
 */

type InvalidCookieReason = 'missing' | 'invalid' | 'expired';

interface CSRFTokenValidationResult {
  isValid: boolean;
  reason?: InvalidCookieReason | 'mismatch';
  shouldRefresh?: boolean;
}

interface ParsedCSRFCookie {
  token: string;
  expiresAt: number;
}

/**
 * Declaring the constants
 */

@Injectable()
export class CSRFTokenService {
  private readonly options: CSRFOptions;
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, 'CSRFTokenService');

  constructor(@Inject(HTTP_CORE_CONFIGS) options: HttpCoreModuleOptions) {
    const cookieName = options.csrf.cookieName.toLowerCase();
    const headerName = options.csrf.headerName.toLowerCase();
    this.options = { ...options.csrf, cookieName, headerName };
  }

  generateToken(): CSRFCookie {
    const expireAt = DateTime.now().plus(this.options.expiresIn);
    const csrfToken = expireAt.toMillis().toString(this.options.tokenRadix) + ':' + crypto.randomBytes(this.options.tokenLength).toString('hex');
    return {
      name: this.options.cookieName,
      value: csrfToken,
      options: { httpOnly: false, sameSite: 'lax', path: '/', expires: expireAt.toJSDate() },
    };
  }

  /** Checks the cookie alone; safe methods never carry the header, so only a missing, malformed or expiring cookie needs re-issuing. */
  inspectCookie(request: HttpRequest): CSRFTokenValidationResult {
    const cookie = this.parseCookie(request);
    if ('reason' in cookie) return { isValid: false, reason: cookie.reason };
    return { isValid: true, shouldRefresh: this.shouldRefresh(cookie.expiresAt) };
  }

  validateToken(request: HttpRequest): CSRFTokenValidationResult {
    const headerToken = request.headers[this.options.headerName];
    if (!headerToken || Array.isArray(headerToken)) {
      this.logger.debug('No or Invalid CSRF token found in request headers');
      return { isValid: false };
    }

    const cookie = this.parseCookie(request);
    if ('reason' in cookie) return { isValid: false, reason: cookie.reason };

    if (headerToken !== cookie.token) {
      this.logger.warn('CSRF token mismatch', { headerToken, cookieToken: cookie.token });
      return { isValid: false, reason: 'mismatch' };
    }

    const shouldRefresh = this.shouldRefresh(cookie.expiresAt);
    this.logger.debug('CSRF token verified successfully', { expiresAt: cookie.expiresAt, shouldRefresh, csrfCookie: request.cookies[this.options.cookieName] });
    return { isValid: true, shouldRefresh };
  }

  private parseCookie(request: HttpRequest): ParsedCSRFCookie | { reason: InvalidCookieReason } {
    const csrfCookie = request.cookies[this.options.cookieName];
    if (!csrfCookie) {
      this.logger.debug('No CSRF token found in cookies');
      return { reason: 'missing' };
    }
    const [expiryTime, token] = csrfCookie.split(':');
    if (!expiryTime || !token) {
      this.logger.warn('Invalid CSRF token found in cookies', { expiryTime, cookieToken: token });
      return { reason: 'invalid' };
    }

    const expiresAt = parseInt(expiryTime, this.options.tokenRadix);
    if (isNaN(expiresAt)) {
      this.logger.warn('Invalid CSRF token expiry time', { expiryTime });
      return { reason: 'invalid' };
    }
    if (Date.now() > expiresAt) {
      this.logger.debug('CSRF token has expired', { expiresAt });
      return { reason: 'expired' };
    }

    return { token, expiresAt };
  }

  private shouldRefresh(expiresAt: number): boolean {
    return DateTime.fromMillis(expiresAt).minus(this.options.refreshLeeway).toMillis() < Date.now();
  }
}
