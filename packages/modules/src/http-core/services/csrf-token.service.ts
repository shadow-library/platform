/**
 * Importing npm packages
 */
import crypto from 'node:crypto';

import { CookieSerializeOptions } from '@fastify/cookie';
import { Inject, Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { HttpRequest } from '@shadow-library/fastify';
import { DateTime, DurationLike } from 'luxon';

/**
 * Importing user defined packages
 */
import { HTTP_CORE_CONFIGS, LOGGER_NAMESPACE } from '../http-core.constants';
import { type HttpCoreModuleOptions } from '../http-core.types';

/**
 * Defining types
 */

export interface CSRFOptions {
  disabled?: boolean;

  cookieName: string;
  headerName: string;
  expiresIn: DurationLike;
  refreshLeeway: DurationLike;
  tokenRadix: number;
  tokenLength: number;
}

export interface CSRFCookie {
  name: string;
  value: string;
  options: CookieSerializeOptions;
}

export type CSRFTokenType = 'token' | 'cookie';

interface CSRFTokenValidationResult {
  isValid: boolean;
  reason?: 'missing' | 'invalid' | 'expired' | 'mismatch';
  shouldRefresh?: boolean;
}

/**
 * Declaring the constants
 */

@Injectable()
export class CSRFTokenService {
  private readonly options: CSRFOptions;
  private readonly logger = Logger.getLogger(LOGGER_NAMESPACE, CSRFTokenService.name);

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

  validateToken(request: HttpRequest): CSRFTokenValidationResult {
    const headerToken = request.headers[this.options.headerName];
    if (!headerToken || Array.isArray(headerToken)) {
      this.logger.debug('No or Invalid CSRF token found in request headers');
      return { isValid: false };
    }

    const csrfCookie = request.cookies[this.options.cookieName];
    if (!csrfCookie) {
      this.logger.debug('No CSRF token found in cookies');
      return { isValid: false, reason: 'missing' };
    }
    const [expiryTime, cookieToken] = csrfCookie.split(':');
    if (!expiryTime || !cookieToken) {
      this.logger.warn('Invalid CSRF token found in cookies', { expiryTime, cookieToken });
      return { isValid: false, reason: 'invalid' };
    }

    const expiresAt = parseInt(expiryTime, this.options.tokenRadix);
    if (isNaN(expiresAt)) {
      this.logger.warn('Invalid CSRF token expiry time', { expiryTime });
      return { isValid: false, reason: 'invalid' };
    }
    if (Date.now() > expiresAt) {
      this.logger.debug('CSRF token has expired', { expiresAt });
      return { isValid: false, reason: 'expired' };
    }

    if (headerToken !== cookieToken) {
      this.logger.warn('CSRF token mismatch', { headerToken, cookieToken });
      return { isValid: false, reason: 'mismatch' };
    }

    const refreshTime = DateTime.fromMillis(expiresAt).minus(this.options.refreshLeeway).toMillis();
    const shouldRefresh = refreshTime < Date.now();

    this.logger.debug('CSRF token verified successfully', { expiresAt, shouldRefresh, csrfCookie });
    return { isValid: true, shouldRefresh };
  }
}
