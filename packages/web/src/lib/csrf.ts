/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */

/**
 * Defining types
 *
 * Every Shadow backend guards mutations with a CSRF double-submit: the request must carry a header whose
 * value equals the token half of an `expiry:token` cookie. The token is not server-minted-only, so a caller
 * that has no cookie yet may mint the pair itself. Both callers need that rule — the browser, which now
 * talks to the same-origin `/api/*` directly, and the SSR transport, which talks to the backend on the
 * caller's behalf — so it lives here once rather than being re-derived on each side.
 */
export interface CsrfConfig {
  /** Cookie the backend reads the token from. @default 'csrf-token' */
  cookie?: string;
  /** Header the backend compares the token against. @default 'x-csrf-token' */
  header?: string;
  /** Lifetime of a minted token. @default 3600 */
  ttlSeconds?: number;
}

export interface CsrfToken {
  /** The value to send in the CSRF header. */
  token: string;
  /** The `expiry:token` cookie value — set only when no usable cookie existed and one had to be minted. */
  mintedValue?: string;
}

/**
 * Declaring the constants
 */
export const CSRF_COOKIE = 'csrf-token';
export const CSRF_HEADER = 'x-csrf-token';
export const CSRF_TTL_SECONDS = 3600;

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Resolve the effective CSRF settings once, so callers can hold on to the pattern instead of rebuilding it per request. */
export function resolveCsrfConfig(config: CsrfConfig = {}): Required<CsrfConfig> & { pattern: RegExp } {
  const cookie = config.cookie ?? CSRF_COOKIE;
  return {
    cookie,
    header: config.header ?? CSRF_HEADER,
    ttlSeconds: config.ttlSeconds ?? CSRF_TTL_SECONDS,
    pattern: new RegExp(`(?:^|;\\s*)${cookie}=([^;]+)`),
  };
}

/**
 * Reads the token out of a cookie header, or mints a fresh `expiry:token` pair when there is none or the
 * one present has expired. A cookie without the `expiry:` prefix is honoured as a bare token — older
 * backends issued that shape and rejecting it would sign those callers out of every mutation.
 */
export function ensureCsrfToken(cookieHeader: string, config: ReturnType<typeof resolveCsrfConfig>, now = Date.now()): CsrfToken {
  const match = cookieHeader.match(config.pattern);
  if (match?.[1]) {
    const value = decodeURIComponent(match[1]);
    const colon = value.indexOf(':');
    const expiry = colon === -1 ? '' : value.slice(0, colon);
    const token = colon === -1 ? value : value.slice(colon + 1);
    if (token && (!expiry || parseInt(expiry, 36) > now)) return { token };
  }

  const token = randomHex(16);
  return { token, mintedValue: `${(now + config.ttlSeconds * 1000).toString(36)}:${token}` };
}

/** The `Set-Cookie` value that persists a minted token. Deliberately not `__Host-` — the browser must be able to read it back. */
export function csrfSetCookie(mintedValue: string, config: ReturnType<typeof resolveCsrfConfig>): string {
  return `${config.cookie}=${encodeURIComponent(mintedValue)}; Path=/; Max-Age=${config.ttlSeconds}; SameSite=Lax`;
}
