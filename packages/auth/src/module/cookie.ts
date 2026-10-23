import { AuthErrorCode } from '../errors';

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

// Hand-rolled rather than `@fastify/cookie`, an optional peer of `@shadow-library/fastify`: requiring it would break working integration from `AuthModule.forRoot()` alone.
// No signing or sealing: the session cookie is an opaque handle and the login-state cookie holds no credential (see `login-state.ts`).

/** The `__Host-` prefix is a browser-enforced promise: same origin, whole path, never a subdomain */
const HOST_PREFIX = '__Host-';

export function assertValidCookieName(name: string, attributes: CookieAttributes): void {
  if (!name.startsWith(HOST_PREFIX)) return;
  if (attributes.secure && attributes.path === '/' && !attributes.domain) return;
  throw AuthErrorCode.CONFIG_INVALID.create({ reason: `cookie '${name}' uses the __Host- prefix, which requires secure, path '/', and no domain` });
}

/** Cookies are attacker-influenced (a sibling subdomain can plant junk), so nothing here may throw or one cookie would wedge every request into a 500 */
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
