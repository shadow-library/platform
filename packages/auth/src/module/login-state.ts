/**
 * Importing npm packages
 */
import { timingSafeEqual } from 'node:crypto';

import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';

/**
 * Defining types
 */

/** Everything an in-flight login needs to survive the round trip to identity and back */
export interface LoginState {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

interface EncodedLoginState extends LoginState {
  /** Epoch milliseconds after which the login is refused; a stale cookie must not redeem */
  exp: number;
}

/**
 * Declaring the constants
 *
 * The transient login state travels in a plain `__Host-`-prefixed, `HttpOnly`, `Secure`,
 * `SameSite=Lax` cookie — no sealing key, no server-side store, and therefore no shared secret to
 * distribute and no single-instance caveat.
 *
 * That is a deliberate downgrade from the sealed cookie it replaces, and it holds because of what
 * each part actually defends:
 *
 *   - Login-CSRF by cookie injection is defeated by the `__Host-` prefix, not by encryption. The
 *     prefix is a browser-enforced promise that only this exact origin, over https, could have set
 *     the cookie — a sibling subdomain cannot plant one, which is the whole attack.
 *   - A leaked PKCE verifier is inert. Redeeming the code needs the application's own M2M
 *     credential (D-18), so an attacker holding state and verifier still cannot exchange anything.
 *   - `state` is matched in constant time against the callback, so the cookie is a comparison
 *     baseline rather than a capability.
 *
 * Single use is the cookie being cleared the moment the callback consumes it, backed by identity
 * invalidating the authorization code on first redemption. Nothing here is a credential, which is
 * why it does not need to be secret.
 */
const logger = Logger.getLogger(NAMESPACE, 'LoginState');

/** A login may stay in flight for ten minutes; the cookie carries the same deadline it enforces */
export const LOGIN_STATE_TTL_SECONDS = 600;

/** Encodes the in-flight login into the value the transient cookie carries */
export function encodeLoginState(state: LoginState, ttlSeconds: number = LOGIN_STATE_TTL_SECONDS): string {
  const payload: EncodedLoginState = { ...state, exp: Date.now() + ttlSeconds * 1000 };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Reads the login back out of the cookie. Cookies are attacker-influenced input, so every failure —
 * junk, truncation, an elapsed deadline — answers the same `null` as no cookie at all, and the
 * callback then fails closed on a login it cannot find.
 */
export function decodeLoginState(value: string | undefined): LoginState | null {
  if (!value) return null;

  try {
    const payload = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as EncodedLoginState;
    if (!isWellFormed(payload)) return null;
    if (payload.exp <= Date.now()) return null;
    return { state: payload.state, nonce: payload.nonce, codeVerifier: payload.codeVerifier, returnTo: payload.returnTo };
  } catch {
    logger.warn('login state cookie could not be read; treating the login as unstarted');
    return null;
  }
}

function isWellFormed(payload: EncodedLoginState): boolean {
  const { state, nonce, codeVerifier, returnTo, exp } = payload;
  return [state, nonce, codeVerifier, returnTo].every(field => typeof field === 'string' && field.length > 0) && Number.isFinite(exp);
}

/** Constant-time comparison of the callback's `state` against the one the cookie carried */
export function matchesState(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
