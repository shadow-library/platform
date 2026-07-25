/**
 * Importing npm packages
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { randomUrlSafeString } from '../rp/pkce';

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

export interface LoginStateStore {
  /**
   * Persists an in-flight login and returns the opaque value to carry in the transient cookie.
   * Implementations may store server-side and return a lookup id, or seal the state into the value
   * itself — the caller cannot tell the difference and must not care.
   */
  save(state: LoginState): Promise<string>;

  /** Consumes the state; it is single-use, so a replayed callback finds nothing */
  take(token: string): Promise<LoginState | null>;
}

export interface LoginStateStoreOptions {
  /** How long a login may stay in flight before its state is refused; defaults to 10 minutes */
  ttlSeconds?: number;
}

export interface SealedLoginStateStoreOptions extends LoginStateStoreOptions {
  /** Any sufficiently unguessable string; the AEAD key is derived from it, never used directly */
  secret: string;
}

interface SealedPayload extends LoginState {
  exp: number;
}

/**
 * Declaring the constants
 *
 * `state`, `nonce` and the PKCE verifier are live credentials for as long as a login is in flight,
 * so neither implementation ever exposes them to the browser in readable form. Which one is in play
 * is decided by configuration: with a session secret the sealed store keeps the deployment stateless
 * across instances; without one the in-memory store is correct but single-instance, and the module
 * says so loudly at startup.
 */
const DEFAULT_TTL_SECONDS = 600;

/** A runaway login loop must not become a memory leak; the oldest in-flight logins go first */
const MAX_PENDING_LOGINS = 10_000;

const AEAD_ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export class InMemoryLoginStateStore implements LoginStateStore {
  private readonly logger = Logger.getLogger(NAMESPACE, InMemoryLoginStateStore.name);
  private readonly pending = new Map<string, { state: LoginState; expiresAt: number }>();
  private readonly ttlSeconds: number;

  constructor(options: LoginStateStoreOptions = {}) {
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  async save(state: LoginState): Promise<string> {
    this.sweep();
    const id = randomUrlSafeString(32);
    this.pending.set(id, { state, expiresAt: Date.now() + this.ttlSeconds * 1000 });
    return id;
  }

  async take(token: string): Promise<LoginState | null> {
    const entry = this.pending.get(token);
    if (!entry) return null;
    this.pending.delete(token);
    if (entry.expiresAt <= Date.now()) return null;
    return entry.state;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.pending) {
      if (entry.expiresAt <= now) this.pending.delete(id);
    }
    while (this.pending.size >= MAX_PENDING_LOGINS) {
      const oldest = this.pending.keys().next().value;
      if (!oldest) break;
      this.pending.delete(oldest);
      this.logger.warn('pending login states exceeded the cap; dropping the oldest entry');
    }
  }
}

/**
 * Seals the state into the cookie value with AES-256-GCM, so the cookie is both unreadable and
 * unforgeable and no instance has to have served the login that is now coming back.
 */
export class SealedLoginStateStore implements LoginStateStore {
  private readonly logger = Logger.getLogger(NAMESPACE, SealedLoginStateStore.name);
  private readonly key: Buffer;
  private readonly ttlSeconds: number;

  /**
   * Seals are self-contained, so nothing about them is inherently single-use. What actually stops a
   * replay is identity invalidating the authorization code on first redemption; this set makes the
   * second attempt fail one step earlier on the instance that served the login, at the cost of one
   * digest per in-flight login.
   */
  private readonly consumed = new Map<string, number>();

  constructor(options: SealedLoginStateStoreOptions) {
    this.key = createHash('sha256').update(options.secret).digest();
    this.ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  }

  async save(state: LoginState): Promise<string> {
    const payload: SealedPayload = { ...state, exp: Date.now() + this.ttlSeconds * 1000 };
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(AEAD_ALGORITHM, this.key, iv);
    const sealed = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), sealed].map(part => part.toString('base64url')).join('.');
  }

  async take(token: string): Promise<LoginState | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const digest = createHash('sha256').update(token).digest('base64url');
    if (this.consumed.has(digest)) return null;

    try {
      const [iv, tag, sealed] = parts.map(part => Buffer.from(part, 'base64url'));
      const decipher = createDecipheriv(AEAD_ALGORITHM, this.key, iv as Buffer);
      decipher.setAuthTag(tag as Buffer);
      const opened = Buffer.concat([decipher.update(sealed as Buffer), decipher.final()]).toString('utf8');
      const payload = JSON.parse(opened) as SealedPayload;
      if (payload.exp <= Date.now()) return null;

      this.consume(digest, payload.exp);
      return { state: payload.state, nonce: payload.nonce, codeVerifier: payload.codeVerifier, returnTo: payload.returnTo };
    } catch {
      /** A tampered or stale-key cookie is indistinguishable from no cookie at all, by design */
      this.logger.warn('login state cookie failed to open; treating the login as unstarted');
      return null;
    }
  }

  /** Digests are only worth remembering until the seal they belong to expires on its own */
  private consume(digest: string, expiresAt: number): void {
    const now = Date.now();
    for (const [seen, expiry] of this.consumed) {
      if (expiry <= now) this.consumed.delete(seen);
    }
    if (this.consumed.size >= MAX_PENDING_LOGINS) this.consumed.clear();
    this.consumed.set(digest, expiresAt);
  }
}

/** Constant-time comparison of the callback's `state` against the stored one */
export function matchesState(expected: string, received: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
