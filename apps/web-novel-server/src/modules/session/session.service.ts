/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import { type FastifyRequest } from 'fastify';
import { Injectable } from '@shadow-library/app';
import { Config, Logger, tryCatch } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

import { LOGIN_COOKIE_NAME, LOGIN_TRANSACTION_TTL_S, SESSION_COOKIE_NAME } from './session.constants';

/**
 * Defining types
 */

export interface ReaderSession {
  userId: string;
  email?: string;
  name?: string;
  /** Unix seconds; the cookie is rejected once past */
  exp: number;
}

export interface LoginTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
  /** Unix seconds; the transaction is rejected once past */
  exp: number;
}

export interface CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax';
  path: string;
  maxAge?: number;
}

/**
 * Declaring the constants
 *
 * Sessions are stateless HMAC-signed cookies minted from the identity-issued ID token: identity
 * owns the accounts, so this service deliberately keeps no users or sessions tables. Revocation
 * granularity is the cookie TTL — acceptable for a public reading shelf.
 */

@Injectable()
export class SessionService {
  private readonly logger = Logger.getLogger(APP_NAME, SessionService.name);

  /*!
   * Reader sessions
   */

  createSessionCookie(session: Omit<ReaderSession, 'exp'>): string {
    const exp = this.now() + Config.get('session.ttl');
    return this.sign({ ...session, exp } satisfies ReaderSession);
  }

  /** Resolves the session cookie to the reader it identifies; throws 401 when absent or invalid */
  authenticate(request: FastifyRequest): ReaderSession {
    const cookie = request.cookies[SESSION_COOKIE_NAME];
    const session = cookie ? this.verify<ReaderSession>(cookie) : null;
    if (!session || typeof session.userId !== 'string') {
      this.logger.debug('session authentication failed', { hasCookie: Boolean(cookie) });
      throw AppErrorCode.WBN_004.create();
    }
    return session;
  }

  getSessionCookieOptions(): CookieOptions {
    return { httpOnly: true, secure: Config.isProd(), sameSite: 'lax', path: '/', maxAge: Config.get('session.ttl') };
  }

  /*!
   * Login transactions
   */

  createLoginCookie(transaction: Omit<LoginTransaction, 'exp'>): string {
    return this.sign({ ...transaction, exp: this.now() + LOGIN_TRANSACTION_TTL_S } satisfies LoginTransaction);
  }

  parseLoginTransaction(request: FastifyRequest): LoginTransaction | null {
    const cookie = request.cookies[LOGIN_COOKIE_NAME];
    if (!cookie) return null;
    const transaction = this.verify<LoginTransaction>(cookie);
    if (!transaction || typeof transaction.state !== 'string' || typeof transaction.codeVerifier !== 'string') return null;
    return transaction;
  }

  getLoginCookieOptions(): CookieOptions {
    return { httpOnly: true, secure: Config.isProd(), sameSite: 'lax', path: '/', maxAge: LOGIN_TRANSACTION_TTL_S };
  }

  /*!
   * Cookie signing — payload is readable base64url JSON; the HMAC stops tampering, not reading
   */

  private sign(payload: object): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${encoded}.${this.hmac(encoded)}`;
  }

  private verify<T extends { exp: number }>(value: string): T | null {
    const [encoded, signature] = value.split('.');
    if (!encoded || !signature) return null;

    const expected = Buffer.from(this.hmac(encoded));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

    const parsed = tryCatch<Error, T>(() => JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as T);
    if (!parsed.success) return null;
    if (typeof parsed.data.exp !== 'number' || parsed.data.exp <= this.now()) return null;
    return parsed.data;
  }

  private hmac(input: string): string {
    return createHmac('sha256', Config.get('session.secret')).update(input).digest('base64url');
  }

  private now(): number {
    return Math.floor(Date.now() / 1000);
  }
}
