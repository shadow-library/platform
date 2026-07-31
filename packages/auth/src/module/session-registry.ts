/**
 * Importing npm packages
 */
import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';

/**
 * Defining types
 */

interface RegisteredSession {
  sub: string;
  expiresAt: number;
}

/**
 * Declaring the constants
 *
 * Back-channel logout arrives keyed by subject, but the SDK deliberately holds no session handles
 * outside the browser's cookie — so the registry maps *hashes* of handles to the user they belong
 * to. That is enough: a revoked hash makes the next request drop its cookie and start a fresh login,
 * and identity has already ended the central session, so no mint from that handle could succeed
 * anyway. Nothing here is a credential, which is the point.
 */
const MAX_TRACKED_SESSIONS = 50_000;

/** How long a handle this process never issued stays remembered as dead once identity has rejected it */
const UNKNOWN_SESSION_MEMORY_MS = 60 * 60 * 1000;

export class SessionRegistry {
  private readonly logger = Logger.getLogger(NAMESPACE, SessionRegistry.name);
  private readonly sessions = new Map<string, RegisteredSession>();
  private readonly bySubject = new Map<string, Set<string>>();

  /**
   * Revoked hashes and when they would have expired anyway. A revoked session must not simply be
   * forgotten: an unknown hash is treated as active on purpose, so deleting one would quietly hand
   * the cookie back its access.
   */
  private readonly revoked = new Map<string, number>();

  register(handleHash: string, sub: string, expiresAt: number): void {
    this.sweep();
    this.sessions.set(handleHash, { sub, expiresAt });
    const hashes = this.bySubject.get(sub) ?? new Set<string>();
    hashes.add(handleHash);
    this.bySubject.set(sub, hashes);
  }

  /**
   * Whether this handle may still be presented. Unknown hashes answer `true`: a process that
   * restarted, or an instance that never served the login, must not log everybody out.
   */
  isActive(handleHash: string): boolean {
    if (this.revoked.has(handleHash)) return false;

    const session = this.sessions.get(handleHash);
    if (!session) return true;
    if (session.expiresAt > Date.now()) return true;
    this.forget(handleHash);
    return false;
  }

  /**
   * Records a handle as dead. Unlike `forget` this is remembered, which is what stops a rejected or
   * logged-out handle from reading as "unknown, therefore active" on the next request — and what
   * keeps a forged cookie from buying another round trip to identity on every retry.
   */
  revoke(handleHash: string): void {
    const expiresAt = this.sessions.get(handleHash)?.expiresAt;
    this.revoked.set(handleHash, expiresAt && expiresAt > Date.now() ? expiresAt : Date.now() + UNKNOWN_SESSION_MEMORY_MS);
    this.forget(handleHash);
  }

  /**
   * Moves a live session onto a freshly issued handle. The old hash is remembered as dead rather than
   * forgotten, and the new one inherits the subject so a back-channel logout still matches it. This is
   * what makes handle rotation — how an organisation switch invalidates tokens cached against the
   * previous handle — safe rather than merely a rename.
   */
  rotate(handleHash: string, rotatedHash: string, expiresAt: number): void {
    const sub = this.sessions.get(handleHash)?.sub;
    this.revoke(handleHash);
    if (sub) this.register(rotatedHash, sub, expiresAt);
  }

  forget(handleHash: string): void {
    const session = this.sessions.get(handleHash);
    if (!session) return;
    this.sessions.delete(handleHash);
    const hashes = this.bySubject.get(session.sub);
    hashes?.delete(handleHash);
    if (hashes && hashes.size === 0) this.bySubject.delete(session.sub);
  }

  /** Ends every session this process knows of for one user; returns the hashes whose tokens must go */
  revokeSubject(sub: string): string[] {
    const hashes = [...(this.bySubject.get(sub) ?? [])];
    for (const hash of hashes) {
      this.revoked.set(hash, this.sessions.get(hash)?.expiresAt ?? Date.now());
      this.sessions.delete(hash);
    }
    this.bySubject.delete(sub);
    if (hashes.length > 0) this.logger.info('sessions invalidated for subject', { sub, sessions: hashes.length });
    return hashes;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [hash, session] of this.sessions) {
      if (session.expiresAt <= now) this.forget(hash);
    }

    /** A revocation only has to outlive the session it ended; after that the handle is dead anyway */
    for (const [hash, expiresAt] of this.revoked) {
      if (expiresAt <= now) this.revoked.delete(hash);
    }
    while (this.sessions.size >= MAX_TRACKED_SESSIONS) {
      const oldest = this.sessions.keys().next().value;
      if (!oldest) break;
      this.forget(oldest);
    }
  }
}
