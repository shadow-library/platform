/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { LOGGED_IN_COOKIE_NAME, SESSION_COOKIE_NAME } from './session.constants';

/**
 * Defining types
 */

export interface CookieSpec {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax' | 'strict' | 'none';
    path: string;
    expires?: Date;
    maxAge?: number;
  };
}

/**
 * Declaring the constants
 *
 * The session secret lives in a `__Host-` prefixed cookie: Secure, HttpOnly, host-only, path=/.
 * SameSite is Lax (not Strict) so top-level OIDC redirects from app subdomains still carry it;
 * CSRF is therefore enforced separately rather than relying on SameSite. A non-HttpOnly companion
 * flag lets client JavaScript detect a session without exposing the secret.
 */

export function buildSessionCookies(secret: string, expiresAt: Date): CookieSpec[] {
  return [
    { name: SESSION_COOKIE_NAME, value: secret, options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', expires: expiresAt } },
    { name: LOGGED_IN_COOKIE_NAME, value: 'true', options: { httpOnly: false, secure: true, sameSite: 'lax', path: '/', expires: expiresAt } },
  ];
}

export function clearSessionCookies(): CookieSpec[] {
  return [
    { name: SESSION_COOKIE_NAME, value: '', options: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 } },
    { name: LOGGED_IN_COOKIE_NAME, value: '', options: { httpOnly: false, secure: true, sameSite: 'lax', path: '/', maxAge: 0 } },
  ];
}
