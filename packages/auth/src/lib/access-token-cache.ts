/**
 * Importing npm packages
 */
import { createHash } from 'node:crypto';

import { Logger } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { AppSessionToken } from '../interfaces';

/**
 * Defining types
 */

export interface AccessTokenKey {
  /** Hash of the session handle — the handle itself never becomes a map key */
  handleHash: string;
  audience: string;
  elevated: boolean;
  scope?: string;
}

interface CachedAccessToken {
  token: AppSessionToken;
  expiresAt: number;
}

/**
 * Declaring the constants
 *
 * Minted tokens are cached until shortly before `exp`, mirroring the service-token manager's margin.
 * Elevation is part of the key rather than a property of the entry, which is what makes an `AAL2`
 * token structurally incapable of answering an `AAL1` lookup — and vice versa. Elevated entries are
 * additionally bounded by their grant window, so an entry cannot outlive the elevation it was minted
 * from even when the token's own `exp` is further out.
 */
const DEFAULT_REFRESH_SKEW_SECONDS = 60;
const DEFAULT_MAX_ENTRIES = 5_000;

/** The only representation of a handle the SDK is allowed to keep outside the cookie */
export function hashSessionHandle(handle: string): string {
  return createHash('sha256').update(handle).digest('base64url');
}

export class AccessTokenCache {
  private readonly logger = Logger.getLogger(NAMESPACE, AccessTokenCache.name);
  private readonly entries = new Map<string, CachedAccessToken>();

  /** Secondary index so a logout, a revoked session, or a back-channel notice can evict in one step */
  private readonly bySession = new Map<string, Set<string>>();

  constructor(
    private readonly refreshSkewSeconds: number = DEFAULT_REFRESH_SKEW_SECONDS,
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {}

  get(key: AccessTokenKey): AppSessionToken | undefined {
    const id = this.id(key);
    const cached = this.entries.get(id);
    if (!cached) return undefined;
    if (cached.expiresAt <= Date.now()) {
      this.evict(id, key.handleHash);
      return undefined;
    }
    return cached.token;
  }

  /** `grantExpiresAt` is the elevation window in epoch milliseconds; entries never outlive it */
  set(key: AccessTokenKey, token: AppSessionToken, grantExpiresAt?: number): void {
    const id = this.id(key);

    /** A bound that is not a real number is treated as already elapsed: `NaN` compares false against
     * everything, so letting one through would produce an entry that never expires — which for an
     * elevated token means an `AAL2` credential outliving the grant that justified it. */
    const bound = grantExpiresAt === undefined ? Infinity : Number.isFinite(grantExpiresAt) ? grantExpiresAt : 0;
    const expiresAt = Math.min(Date.now() + (token.expiresIn - this.refreshSkewSeconds) * 1000, bound);

    /** Whatever was here is superseded, so it goes even when the replacement is too short-lived to keep */
    this.evict(id, key.handleHash);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;

    this.entries.set(id, { token, expiresAt });
    const ids = this.bySession.get(key.handleHash) ?? new Set<string>();
    ids.add(id);
    this.bySession.set(key.handleHash, ids);
    this.prune();
  }

  /** Drops every token minted for one session — used on logout, `SESSION_INVALID`, and back-channel logout */
  evictSession(handleHash: string): void {
    const ids = this.bySession.get(handleHash);
    if (!ids) return;
    for (const id of ids) this.entries.delete(id);
    this.bySession.delete(handleHash);
    this.logger.debug('cached tokens evicted for session', { entries: ids.size });
  }

  /** Drops only the elevated entries of a session, leaving its ordinary tokens in place */
  evictElevated(handleHash: string): void {
    const ids = this.bySession.get(handleHash);
    if (!ids) return;
    for (const id of ids) {
      if (!id.includes('|AAL2|')) continue;
      this.entries.delete(id);
      ids.delete(id);
    }
  }

  clear(): void {
    this.entries.clear();
    this.bySession.clear();
  }

  private id(key: AccessTokenKey): string {
    return `${key.handleHash}|${key.elevated ? 'AAL2' : 'AAL1'}|${key.audience}|${key.scope ?? ''}`;
  }

  private evict(id: string, handleHash: string): void {
    this.entries.delete(id);
    this.bySession.get(handleHash)?.delete(id);
  }

  /** Sweeps expired entries first and only then falls back to dropping the oldest insertion */
  private prune(): void {
    if (this.entries.size <= this.maxEntries) return;
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(id);
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
    for (const [handleHash, ids] of this.bySession) {
      for (const id of ids) if (!this.entries.has(id)) ids.delete(id);
      if (ids.size === 0) this.bySession.delete(handleHash);
    }
  }
}
