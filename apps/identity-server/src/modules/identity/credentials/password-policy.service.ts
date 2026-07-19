/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import validator, { StrongPasswordOptions } from 'validator';
import { Injectable } from '@shadow-library/app';
import { Config, Logger, ValidationError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { APP_NAME, ERROR_MESSAGES, hibpRangeUrl } from '@server/constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const STRENGTH_OPTIONS: StrongPasswordOptions = { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 };

/**
 * Enforces password strength and, when enabled, checks candidates against the Have I Been Pwned
 * k-anonymity range API. The breach check is fail-open: an outage must never block a legitimate
 * credential change, so provider errors are logged and treated as "not breached".
 */
@Injectable()
export class PasswordPolicyService {
  private readonly logger = Logger.getLogger(APP_NAME, PasswordPolicyService.name);
  private readonly breachCheckEnabled = Config.get('auth.password.breach-check-enabled');

  assertStrong(password: string): void {
    if (!validator.isStrongPassword(password, STRENGTH_OPTIONS) || password.length > 128) throw new ValidationError('password', ERROR_MESSAGES.INVALID_PASSWORD);
  }

  /** Raw fetch, not APIRequest: the HIBP range API answers text/plain, which APIRequest cannot parse. */
  async isBreached(password: string): Promise<boolean> {
    if (!this.breachCheckEnabled) return false;
    try {
      const sha1 = createHash('sha1').update(password).digest('hex').toUpperCase();
      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);
      const response = await fetch(hibpRangeUrl(prefix), { headers: { 'add-padding': 'true' } });
      if (!response.ok) return false;
      const body = await response.text();
      return body.split('\n').some(line => line.split(':')[0]?.trim() === suffix);
    } catch (error) {
      this.logger.warn('Password breach check failed; allowing the password (fail-open)', { error });
      return false;
    }
  }

  async assertAcceptable(password: string): Promise<void> {
    this.assertStrong(password);
    if (await this.isBreached(password)) throw new ValidationError('password', ERROR_MESSAGES.BREACHED_PASSWORD);
  }
}
