import { LOGGED_IN_COOKIE_NAME, SESSION_COOKIE_NAME } from './session.constants';

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

export function buildSessionCookies(secret: string, expiresAt: Date): CookieSpec[] {
  /** Lax is required for top-level OIDC returns; CSRF protection cannot rely on SameSite alone. */
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
