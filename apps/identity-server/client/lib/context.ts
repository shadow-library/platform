/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const DEVICE_ID_KEY = 'shadow-identity.device-id';
const LOGGED_IN_COOKIE = 'isLoggedIn';

/** Stable per-browser device identifier fed into flow inits for device recognition. */
export function deviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

/** UI hint only — the `__Host-sid` cookie is HttpOnly, so this is the visible signal. */
export function isLoggedIn(): boolean {
  return document.cookie.split('; ').some(part => part === `${LOGGED_IN_COOKIE}=true`);
}

/**
 * The OIDC handoff carries the pending authorize URL in `return_to`. Only a same-origin
 * `/oauth2/authorize` target is honored — anything else is an open-redirect attempt and
 * collapses to the account home.
 */
export function safeReturnTo(search: string = window.location.search): string | undefined {
  const raw = new URLSearchParams(search).get('return_to');
  if (!raw) return undefined;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin === window.location.origin && url.pathname === '/oauth2/authorize') return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}
