/**
 * Importing npm packages
 */
import { type CookieSerializeOptions } from '@fastify/cookie';
import { type DurationLike } from 'luxon';

/**
 * Importing user defined packages
 */

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
