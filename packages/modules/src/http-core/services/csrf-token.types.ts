import { type CookieSerializeOptions } from '@fastify/cookie';
import { type DurationLike } from 'luxon';

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
