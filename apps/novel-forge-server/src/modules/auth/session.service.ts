/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { type CookieSerializeOptions } from '@fastify/cookie';
import { Injectable } from '@shadow-library/app';
import { AuthClient } from '@shadow-library/auth';
import { type TokenSet } from '@shadow-library/auth/rp';
import { Config, Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';

/**
 * Defining types
 */

export interface SessionData {
  accessToken: string;
  email?: string;
  name?: string;
}

export interface LoginFlowData {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

export interface SessionUser {
  userId: string;
  email?: string;
  name?: string;
}

export interface SealedCookie {
  value: string;
  options: CookieSerializeOptions;
}

/**
 * Declaring the constants
 *
 * The session is fully stateless: the access token (plus the profile claims the token itself does
 * not carry) lives in an AES-256-GCM sealed, httpOnly cookie. Every read re-verifies the token
 * offline against the identity JWKS, so revocation and expiry behave exactly like bearer auth —
 * there is no refresh token; when the token expires the web app simply sends the user back through
 * `/api/auth/login`.
 */
export const SESSION_COOKIE = 'nf-session';
export const LOGIN_FLOW_COOKIE = 'nf-oidc';

const LOGIN_FLOW_TTL_SECONDS = 600;
const IV_LENGTH = 12;

@Injectable()
export class SessionService {
  private readonly logger = Logger.getLogger(APP_NAME, SessionService.name);
  private readonly key = createHash('sha256').update(Config.get('auth.session.seal-secret')).digest();

  constructor(private readonly authClient: AuthClient) {}

  /** Builds the session cookie from a completed code exchange; profile claims come from the ID token */
  createSessionCookie(tokens: TokenSet): SealedCookie {
    const claims = tokens.idTokenClaims ?? {};
    const data: SessionData = { accessToken: tokens.accessToken };
    if (typeof claims.email === 'string') data.email = claims.email;
    if (typeof claims.name === 'string') data.name = claims.name;
    return { value: this.seal(data), options: this.cookieOptions(tokens.expiresIn) };
  }

  createLoginFlowCookie(flow: LoginFlowData): SealedCookie {
    return { value: this.seal(flow), options: this.cookieOptions(LOGIN_FLOW_TTL_SECONDS) };
  }

  clearedCookieOptions(): CookieSerializeOptions {
    return this.cookieOptions(0);
  }

  /** Returns the sealed session's access token without verifying it; for the cookie→bearer bridge */
  peekAccessToken(cookieValue: string | undefined): string | undefined {
    const data = this.open<SessionData>(cookieValue);
    return typeof data?.accessToken === 'string' ? data.accessToken : undefined;
  }

  /** Resolves the current user from the session cookie, verifying the access token against identity */
  async resolveSession(cookieValue: string | undefined): Promise<SessionUser> {
    const data = this.open<SessionData>(cookieValue);
    if (!data?.accessToken) throw AppErrorCode.SES_001.create();

    const principal = await this.authClient.verify(data.accessToken).catch((error: Error) => {
      this.logger.debug('session access token rejected', { reason: error.message });
      return AppErrorCode.SES_001.throw();
    });

    const user: SessionUser = { userId: principal.sub };
    if (data.email) user.email = data.email;
    if (data.name) user.name = data.name;
    return user;
  }

  openLoginFlow(cookieValue: string | undefined): LoginFlowData {
    const flow = this.open<LoginFlowData>(cookieValue);
    if (!flow?.state || !flow.codeVerifier) throw AppErrorCode.SES_002.create();
    return flow;
  }

  /** Only same-origin relative paths may round-trip through the login flow — never absolute URLs */
  normalizeReturnTo(returnTo: string | undefined): string {
    if (returnTo === undefined) return '/';
    if (!returnTo.startsWith('/') || returnTo.startsWith('//')) throw AppErrorCode.SES_003.create();
    return returnTo;
  }

  private cookieOptions(maxAge: number): CookieSerializeOptions {
    return { path: '/', httpOnly: true, sameSite: 'lax', secure: Config.isProd(), maxAge };
  }

  private seal(payload: object): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64url');
  }

  private open<T>(value: string | undefined): T | null {
    if (!value) return null;
    try {
      const raw = Buffer.from(value, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, IV_LENGTH));
      decipher.setAuthTag(raw.subarray(IV_LENGTH, IV_LENGTH + 16));
      const plaintext = Buffer.concat([decipher.update(raw.subarray(IV_LENGTH + 16)), decipher.final()]);
      return JSON.parse(plaintext.toString('utf8')) as T;
    } catch {
      return null;
    }
  }
}
