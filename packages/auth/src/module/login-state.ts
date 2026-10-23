import { timingSafeEqual } from 'node:crypto';

import { Logger } from '@shadow-library/common';

import { NAMESPACE } from '../constants';

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

// The state cookie is plain (no sealing key, no store) because nothing in it is a credential:
// - login-CSRF by cookie injection is defeated by the `__Host-` prefix, which only this exact origin over https can set, so a sibling subdomain cannot plant one;
// - a leaked PKCE verifier is inert, since redeeming the code needs the application's own M2M credential;
// - `state` is compared in constant time, so the cookie is a comparison baseline, not a capability.
// Single use is the callback clearing the cookie, backed by identity invalidating the code on first redemption.
const logger = Logger.getLogger(NAMESPACE, 'LoginState');

export const LOGIN_STATE_TTL_SECONDS = 600;

export function encodeLoginState(state: LoginState, ttlSeconds: number = LOGIN_STATE_TTL_SECONDS): string {
  const payload: EncodedLoginState = { ...state, exp: Date.now() + ttlSeconds * 1000 };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/** Cookies are attacker-influenced: every failure (junk, truncation, elapsed deadline) answers `null` like no cookie, so the callback fails closed */
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

export function matchesState(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
