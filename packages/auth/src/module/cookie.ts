/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AuthErrorCode } from '../errors';

/**
 * Defining types
 */

export type SameSitePolicy = 'Lax' | 'Strict' | 'None';

export interface CookieAttributes {
  path: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: SameSitePolicy;
  /** Lifetime in seconds; omitted, the cookie is a session cookie */
  maxAge?: number;
  domain?: string;
}

/**
 * Declaring the constants
 *
 * Deliberately hand-rolled rather than routed through `@fastify/cookie`: that plugin is an *optional*
 * peer of `@shadow-library/fastify`, and requiring it would mean a service could no longer get a
 * working integration from `AuthModule.forRoot()` plus environment variables alone. Nothing here
 * needs signing either — the session cookie carries an opaque handle and the login-state cookie is
 * sealed with AEAD before it ever reaches this layer.
 */

/** The `__Host-` prefix is a browser-enforced promise: same origin, whole path, never a subdomain */
const HOST_PREFIX = '__Host-';

export function assertValidCookieName(name: string, attributes: CookieAttributes): void {
  if (!name.startsWith(HOST_PREFIX)) return;
  if (attributes.secure && attributes.path === '/' && !attributes.domain) return;
  throw AuthErrorCode.CONFIG_INVALID.create({ reason: `cookie '${name}' uses the __Host- prefix, which requires secure, path '/', and no domain` });
}

/**
 * A request's cookies are attacker-influenced input: any page on a sibling subdomain can plant a
 * malformed one. Nothing in here may throw, or a single junk cookie would wedge every request from
 * that browser into a 500 with no way for the user to recover.
 */
export function parseCookies(header: string | string[] | undefined): Record<string, string> {
  const cookies: Record<string, string> = Object.create(null) as Record<string, string>;
  const raw = Array.isArray(header) ? header.join('; ') : header;
  if (!raw) return cookies;

  for (const pair of raw.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 1) continue;
    const name = pair.slice(0, separator).trim();
    if (!name || name in cookies) continue;
    cookies[name] = decodeValue(pair.slice(separator + 1).trim());
  }
  return cookies;
}

/** Malformed percent-encoding is not ours to reject; the raw value simply fails the lookup it feeds */
function decodeValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function serializeCookie(name: string, value: string, attributes: CookieAttributes): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${attributes.path}`, `SameSite=${attributes.sameSite}`];
  if (attributes.domain) parts.push(`Domain=${attributes.domain}`);
  if (attributes.maxAge !== undefined) parts.push(`Max-Age=${attributes.maxAge}`);
  if (attributes.httpOnly) parts.push('HttpOnly');
  if (attributes.secure) parts.push('Secure');
  return parts.join('; ');
}

/** An immediate expiry carrying the same attributes, which is what makes a browser actually drop it */
export function expireCookie(name: string, attributes: CookieAttributes): string {
  return serializeCookie(name, '', { ...attributes, maxAge: 0 });
}
