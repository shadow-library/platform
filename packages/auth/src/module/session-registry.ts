import { Logger } from '@shadow-library/common';

import { NAMESPACE } from '../constants';

interface RegisteredSession {
  sub: string;
  expiresAt: number;
}

// Back-channel logout is keyed by subject but the SDK holds no handles outside the cookie, so this maps hashes of handles to users; nothing here is a credential.
const MAX_TRACKED_SESSIONS = 50_000;

/** How long a handle this process never issued stays remembered as dead once identity has rejected it */
const UNKNOWN_SESSION_MEMORY_MS = 60 * 60 * 1000;

export class SessionRegistry {
  private readonly logger = Logger.getLogger(NAMESPACE, SessionRegistry.name);
  private readonly sessions = new Map<string, RegisteredSession>();
  private readonly bySubject = new Map<string, Set<string>>();

  /** Revoked hashes with their natural expiry; forgetting one would hand the cookie back its access, since unknown hashes read as active */
  private readonly revoked = new Map<string, number>();

  register(handleHash: string, sub: string, expiresAt: number): void {
    this.sweep();
    this.sessions.set(handleHash, { sub, expiresAt });
    const hashes = this.bySubject.get(sub) ?? new Set<string>();
    hashes.add(handleHash);
    this.bySubject.set(sub, hashes);
  }

  /** Unknown hashes answer `true`: a restarted process, or an instance that never served the login, must not log everybody out */
  isActive(handleHash: string): boolean {
    if (this.revoked.has(handleHash)) return false;

    const session = this.sessions.get(handleHash);
    if (!session) return true;
    if (session.expiresAt > Date.now()) return true;
    this.forget(handleHash);
    return false;
  }

  /** Unlike `forget` this is remembered, so a rejected handle does not read as "unknown, therefore active" or buy a forged cookie another identity round trip per retry */
  revoke(handleHash: string): void {
    const expiresAt = this.sessions.get(handleHash)?.expiresAt;
    this.revoked.set(handleHash, expiresAt && expiresAt > Date.now() ? expiresAt : Date.now() + UNKNOWN_SESSION_MEMORY_MS);
    this.forget(handleHash);
  }

  /**
   * The old hash is remembered as dead, which is how an organisation switch invalidates tokens cached against it; the new one inherits the subject so back-channel logout
   * still matches
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

    // A revocation only has to outlive the session it ended
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
