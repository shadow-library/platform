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

  /** What the caller asks for. Entries are stored under what identity actually granted, never this */
  scope?: string;
}

interface CachedAccessToken {
  token: AppSessionToken;
  expiresAt: number;

  /** The request keys that resolve here, so evicting an entry takes its lookups with it */
  requestIds: Set<string>;
}

/**
 * Declaring the constants
 *
 * Minted tokens are cached until shortly before `exp`, mirroring the service-token manager's margin.
 *
 * Two things are structural rather than advisory. Elevation is part of the key rather than a property
 * of the entry, which makes an `AAL2` token incapable of answering an `AAL1` lookup and vice versa;
 * elevated entries are additionally bounded by their grant window, so one cannot outlive the elevation
 * it was minted from even when the token's own `exp` is further out.
 *
 * And an entry is filed under the scope identity **granted**, not the scope that was requested. The
 * server narrows silently, so requested-keying would leave an entry labelled `posts:read posts:write`
 * holding a token that only carries `posts:read` — a cache that lies about its own contents. Requests
 * reach it through a second, explicitly separate lookup, so the two can never be confused.
 */
const DEFAULT_REFRESH_SKEW_SECONDS = 60;
const DEFAULT_MAX_ENTRIES = 5_000;

/** The only representation of a handle the SDK is allowed to keep outside the cookie */
export function hashSessionHandle(handle: string): string {
  return createHash('sha256').update(handle).digest('base64url');
}

export class AccessTokenCache {
  private readonly logger = Logger.getLogger(NAMESPACE, AccessTokenCache.name);

  /** Keyed by granted scope; what a caller asked for never names an entry */
  private readonly entries = new Map<string, CachedAccessToken>();

  /** The requested-scope lookup: request key → the granted-scope entry that satisfies it */
  private readonly lookups = new Map<string, string>();

  /** Secondary index so a logout, a revoked session, or a back-channel notice can evict in one step */
  private readonly bySession = new Map<string, Set<string>>();

  constructor(
    private readonly refreshSkewSeconds: number = DEFAULT_REFRESH_SKEW_SECONDS,
    private readonly maxEntries: number = DEFAULT_MAX_ENTRIES,
  ) {}

  get(key: AccessTokenKey): AppSessionToken | undefined {
    const requestId = this.requestId(key);
    const grantedId = this.lookups.get(requestId);
    if (!grantedId) return undefined;

    const cached = this.entries.get(grantedId);
    if (!cached) {
      this.lookups.delete(requestId);
      return undefined;
    }
    if (cached.expiresAt <= Date.now()) {
      this.evict(grantedId, key.handleHash);
      return undefined;
    }
    return cached.token;
  }

  /** `grantExpiresAt` is the elevation window in epoch milliseconds; entries never outlive it */
  set(key: AccessTokenKey, token: AppSessionToken, grantExpiresAt?: number): void {
    const requestId = this.requestId(key);
    const grantedId = this.grantedId(key, token);

    /** An earlier mint for this request may have been granted something else; that lookup is now stale */
    const previous = this.lookups.get(requestId);
    if (previous && previous !== grantedId) this.detach(requestId, previous, key.handleHash);

    /**
     * A bound that is not a real number is treated as already elapsed: `NaN` compares false against
     * everything, so letting one through would produce an entry that never expires — which for an
     * elevated token means an `AAL2` credential outliving the grant that justified it.
     */
    const bound = grantExpiresAt === undefined ? Infinity : Number.isFinite(grantExpiresAt) ? grantExpiresAt : 0;
    const expiresAt = Math.min(Date.now() + (token.expiresIn - this.refreshSkewSeconds) * 1000, bound);

    /** Whatever was here is superseded, so it goes even when the replacement is too short-lived to keep */
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      this.evict(grantedId, key.handleHash);
      this.lookups.delete(requestId);
      return;
    }

    const requestIds = this.entries.get(grantedId)?.requestIds ?? new Set<string>();
    requestIds.add(requestId);
    this.entries.set(grantedId, { token, expiresAt, requestIds });
    this.lookups.set(requestId, grantedId);

    const ids = this.bySession.get(key.handleHash) ?? new Set<string>();
    ids.add(grantedId);
    this.bySession.set(key.handleHash, ids);
    this.prune();
  }

  /** Drops every token minted for one session — used on logout, `SESSION_INVALID`, and back-channel logout */
  evictSession(handleHash: string): void {
    const ids = this.bySession.get(handleHash);
    if (!ids) return;
    for (const id of [...ids]) this.evict(id, handleHash);
    this.bySession.delete(handleHash);
    this.logger.debug('cached tokens evicted for session', { entries: ids.size });
  }

  /** Drops only the elevated entries of a session, leaving its ordinary tokens in place */
  evictElevated(handleHash: string): void {
    const ids = this.bySession.get(handleHash);
    if (!ids) return;
    for (const id of [...ids]) {
      if (id.includes('|AAL2|')) this.evict(id, handleHash);
    }
  }

  clear(): void {
    this.entries.clear();
    this.lookups.clear();
    this.bySession.clear();
  }

  /** Names the lookup a caller performs: everything but the scope, which is what it asked for */
  private requestId(key: AccessTokenKey): string {
    return `${this.prefix(key)}|request:${normalise(key.scope?.split(' '))}`;
  }

  /** Names the entry itself: everything but the scope, which is what identity actually granted */
  private grantedId(key: AccessTokenKey, token: AppSessionToken): string {
    return `${this.prefix(key)}|granted:${normalise(token.grantedScopes)}`;
  }

  private prefix(key: AccessTokenKey): string {
    return `${key.handleHash}|${key.elevated ? 'AAL2' : 'AAL1'}|${key.audience}`;
  }

  private evict(grantedId: string, handleHash: string): void {
    const cached = this.entries.get(grantedId);
    this.entries.delete(grantedId);
    for (const requestId of cached?.requestIds ?? []) this.lookups.delete(requestId);
    this.bySession.get(handleHash)?.delete(grantedId);
  }

  /** Unhooks one request from an entry, taking the entry with it once nothing reaches it any more */
  private detach(requestId: string, grantedId: string, handleHash: string): void {
    this.lookups.delete(requestId);
    const cached = this.entries.get(grantedId);
    if (!cached) return;
    cached.requestIds.delete(requestId);
    if (cached.requestIds.size === 0) this.evict(grantedId, handleHash);
  }

  /** Sweeps expired entries first and only then falls back to dropping the oldest insertion */
  private prune(): void {
    if (this.entries.size <= this.maxEntries) return;
    const now = Date.now();
    for (const [id, entry] of [...this.entries]) {
      if (entry.expiresAt <= now) this.evict(id, sessionOf(id));
    }
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (!oldest) break;
      this.evict(oldest, sessionOf(oldest));
    }
    for (const [handleHash, ids] of this.bySession) {
      for (const id of ids) if (!this.entries.has(id)) ids.delete(id);
      if (ids.size === 0) this.bySession.delete(handleHash);
    }
  }
}

/** Scope is a set, not a sequence, so two spellings of the same grant must name the same entry */
function normalise(scopes: string[] | undefined): string {
  return [...(scopes ?? [])].filter(Boolean).sort().join(' ');
}

/** The handle hash leads every id, so an entry always knows which session index holds it */
function sessionOf(id: string): string {
  return id.slice(0, id.indexOf('|'));
}
