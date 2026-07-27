/**
 * Importing npm packages
 */
import { APIRequest } from '@shadow-library/web';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */
export type ApiMode = 'fixtures' | 'server';

interface CsrfToken {
  token: string;
  setCookie?: string;
}

/**
 * Declaring the constants
 *
 * The browser hits the same-origin `/api` (vite proxies it in dev; a reverse proxy routes it in prod). SSR
 * loaders run in the Start server process, where relative URLs cannot resolve — point the shared transport
 * at the backend origin there. webnovel-server does not exist yet, so dev defaults to typed fixtures; set
 * `VITE_API_MODE=server` to exercise the real HTTP path through the vite proxy.
 */
const SERVER_ORIGIN = typeof process === 'undefined' ? '' : (process.env.SERVER_URL ?? 'http://localhost:8080');
if (typeof window === 'undefined') APIRequest.setBaseUrl(SERVER_ORIGIN);

const CSRF_COOKIE = 'csrf-token';
const CSRF_HEADER = 'x-csrf-token';
const CSRF_TTL_MS = 3_600_000;
const CSRF_COOKIE_PATTERN = new RegExp(`(?:^|;\\s*)${CSRF_COOKIE}=([^;]+)`);

/**
 * webnovel-server's CSRF middleware double-submits: a mutation must carry an `x-csrf-token` header equal to
 * the token part of the cookie's `expiry:token` value. The token is not server-minted-only, so echo the
 * cookie when it is present and unexpired, and mint a fresh pair otherwise — the same strategy the
 * ecosystem's `serverFetch` applies on the SSR path.
 */
export function ensureCsrfToken(cookies: string, now = Date.now()): CsrfToken {
  const match = cookies.match(CSRF_COOKIE_PATTERN);
  if (match?.[1]) {
    const value = decodeURIComponent(match[1]);
    const colon = value.indexOf(':');
    const expiry = colon === -1 ? '' : value.slice(0, colon);
    const token = colon === -1 ? value : value.slice(colon + 1);
    if (token && (!expiry || parseInt(expiry, 36) > now)) return { token };
  }
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);
  const token = Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
  const minted = `${(now + CSRF_TTL_MS).toString(36)}:${token}`;
  return { token, setCookie: `${CSRF_COOKIE}=${encodeURIComponent(minted)}; Path=/; Max-Age=${CSRF_TTL_MS / 1000}; SameSite=Lax` };
}

/** Browser mutations satisfy the double-submit here; SSR-side authed calls go through `serverFetch`, which already does. */
if (typeof document !== 'undefined') {
  APIRequest.setPreRequestHook(({ options }) => {
    if (options.method === 'GET') return;
    const csrf = ensureCsrfToken(document.cookie);
    if (csrf.setCookie) document.cookie = csrf.setCookie;
    options.headers[CSRF_HEADER] = csrf.token;
  });
}

export const apiMode: ApiMode = import.meta.env.DEV && import.meta.env.VITE_API_MODE !== 'server' ? 'fixtures' : 'server';

export const useFixtures = apiMode === 'fixtures';

/** Deterministic small delay so fixture responses exercise loading states without feeling sluggish. */
export function fixtureDelay<T>(value: T, ms = 120): Promise<T> {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

export { APIRequest };
export { ApiError, isApiError } from '@shadow-library/web';
