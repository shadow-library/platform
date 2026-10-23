import { createHash } from 'node:crypto';

import { Logger } from '@shadow-library/common';

import { NAMESPACE } from '../constants';
import { AppSessionToken } from '../interfaces';

export interface AccessTokenKey {
  /** The handle itself never becomes a map key */
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

// Elevation is part of the key, so an `AAL2` token cannot answer an `AAL1` lookup; elevated entries are also bounded by their grant window so they cannot outlive the elevation.
// Entries are filed under the scope identity granted, not requested: the server narrows silently, and requested-keying would label an entry `posts:read posts:write` while
// holding only `posts:read`.
// Requests reach entries through a separate lookup so the two never mix.
const DEFAULT_REFRESH_SKEW_SECONDS = 60;
const DEFAULT_MAX_ENTRIES = 5_000;

export function hashSessionHandle(handle: string): string {
  return createHash('sha256').update(handle).digest('base64url');
}

export class AccessTokenCache {
  private readonly logger = Logger.getLogger(NAMESPACE, AccessTokenCache.name);

  private readonly entries = new Map<string, CachedAccessToken>();

  private readonly lookups = new Map<string, string>();

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

  /** `grantExpiresAt` is the elevation window in epoch ms; entries never outlive it */
  set(key: AccessTokenKey, token: AppSessionToken, grantExpiresAt?: number): void {
    const requestId = this.requestId(key);
    const grantedId = this.grantedId(key, token);

    const previous = this.lookups.get(requestId);
    if (previous && previous !== grantedId) this.detach(requestId, previous, key.handleHash);

    // A non-finite bound counts as elapsed: NaN compares false against everything and would yield an entry that never expires, i.e. AAL2 outliving its grant
    const bound = grantExpiresAt === undefined ? Infinity : Number.isFinite(grantExpiresAt) ? grantExpiresAt : 0;
    const expiresAt = Math.min(Date.now() + (token.expiresIn - this.refreshSkewSeconds) * 1000, bound);

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

  evictSession(handleHash: string): void {
    const ids = this.bySession.get(handleHash);
    if (!ids) return;
    for (const id of [...ids]) this.evict(id, handleHash);
    this.bySession.delete(handleHash);
    this.logger.debug('cached tokens evicted for session', { entries: ids.size });
  }

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

  private requestId(key: AccessTokenKey): string {
    return `${this.prefix(key)}|request:${normalise(key.scope?.split(' '))}`;
  }

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

  private detach(requestId: string, grantedId: string, handleHash: string): void {
    this.lookups.delete(requestId);
    const cached = this.entries.get(grantedId);
    if (!cached) return;
    cached.requestIds.delete(requestId);
    if (cached.requestIds.size === 0) this.evict(grantedId, handleHash);
  }

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

function normalise(scopes: string[] | undefined): string {
  return [...(scopes ?? [])].filter(Boolean).sort().join(' ');
}

function sessionOf(id: string): string {
  return id.slice(0, id.indexOf('|'));
}
