import { Logger, utils } from '@shadow-library/common';

import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { CheckInput, CheckOptions, FetchLike } from '../interfaces';
import { isThrottled, retryAfterHint, retryAfterSecondsOf, TOO_MANY_REQUESTS } from './transport';

export interface PdpClientOptions {
  baseUrl: string;
  fetchFn: FetchLike;
  /** A failed acquisition falls back to an unauthenticated call */
  getToken?: () => Promise<string>;
  ttlSeconds?: number;
  maxEntries?: number;
}

interface CachedDecision {
  permitted: boolean;
  authzVersion: number;
  expiresAt: number;
}

interface PdpResponse {
  decision?: 'PERMIT' | 'DENY';
  authzVersion?: number;
}

// Every PDP response piggybacks the principal's `authz_version`; a bump discards that principal's stale entries so grant changes propagate in one round trip instead of a full TTL.
// A bot's decision is always high-risk: admins can revoke its grants at any time, and a long-TTL entry from a routine check would answer the guard's later ones.
// A throttle is not a DENY: identity said "not now", and a 403 would refuse an entitled caller with no retry able to fix it, so it is rethrown as 503 unless `failOpen`.
// Limiters are fixed windows and `Retry-After` is what remains of the current one, so a throttle is retried once and only when the named wait is short; with no hint the
// retry would land in the same window.
// The jitter keeps waiters throttled at the same instant from returning together.
const DEFAULT_TTL_SECONDS = 900;
const HIGH_RISK_TTL_SECONDS = 60;
const DEFAULT_MAX_ENTRIES = 1000;
const THROTTLE_RETRIES = 1;
const THROTTLE_MAX_WAIT_SECONDS = 1;
const THROTTLE_JITTER_MS = 250;

export class PdpClient {
  private readonly logger = Logger.getLogger(NAMESPACE, PdpClient.name);
  private readonly cache = new Map<string, CachedDecision>();
  private readonly versions = new Map<string, number>();
  private readonly inflight = new Map<string, Promise<boolean>>();

  constructor(private readonly options: PdpClientOptions) {}

  async check(input: CheckInput, checkOptions: CheckOptions = {}): Promise<boolean> {
    const options = input.principal.kind === 'bot' ? { ...checkOptions, highRisk: true } : checkOptions;
    const organisationId = input.organisationId ?? input.principal.org;
    if (!organisationId) return false;

    const principalKey = `${input.principal.kind}:${input.principal.sub}`;
    const key = `${principalKey}:${organisationId}:${input.action}`;
    const minVersion = this.versions.get(principalKey) ?? 0;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now() && cached.authzVersion >= minVersion) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached.permitted;
    }

    try {
      return await this.dedupe(key, options, () => this.requestWithinThrottle(principalKey, key, organisationId, input, options));
    } catch (error) {
      if (isThrottled(error) && !options.failOpen) {
        this.logger.warn('pdp check throttled past its retries; answering unavailable rather than denied', { action: input.action, retryAfterSeconds: retryAfterHint(error) });
        throw error;
      }
      this.logger.warn('pdp check failed; applying fallback decision', { action: input.action, failOpen: options.failOpen ?? false, reason: (error as Error).message });
      return options.failOpen ?? false;
    }
  }

  checkAll(inputs: CheckInput[], options: CheckOptions = {}): Promise<boolean[]> {
    return Promise.all(inputs.map(input => this.check(input, options)));
  }

  /** `highRisk` joins the key because sharing across it would let a high-risk check ride on a long-TTL result; rejections reach every waiter so each applies its own `failOpen` */
  private dedupe(key: string, options: CheckOptions, run: () => Promise<boolean>): Promise<boolean> {
    const flightKey = options.highRisk ? `${key}:high-risk` : key;
    const existing = this.inflight.get(flightKey);
    if (existing) return existing;

    const flight = run().finally(() => this.inflight.delete(flightKey));
    this.inflight.set(flightKey, flight);
    return flight;
  }

  private async requestWithinThrottle(principalKey: string, key: string, organisationId: string, input: CheckInput, options: CheckOptions): Promise<boolean> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.request(principalKey, key, organisationId, input, options);
      } catch (error) {
        const waitMs = this.throttleWait(error, attempt);
        if (waitMs === undefined) throw error;
        await utils.temporal.sleep(waitMs);
      }
    }
  }

  private throttleWait(error: unknown, attempt: number): number | undefined {
    if (!isThrottled(error) || attempt >= THROTTLE_RETRIES) return undefined;
    const hint = retryAfterHint(error);
    if (hint === undefined || hint > THROTTLE_MAX_WAIT_SECONDS) return undefined;
    return hint * 1000 + Math.floor(Math.random() * THROTTLE_JITTER_MS);
  }

  private async request(principalKey: string, key: string, organisationId: string, input: CheckInput, options: CheckOptions): Promise<boolean> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const token = await this.options.getToken?.().catch((error: Error) => {
      this.logger.warn('pdp token acquisition failed; calling unauthenticated', { reason: error.message });
      return null;
    });
    if (token) headers.authorization = `Bearer ${token}`;

    const body = JSON.stringify({
      principalType: input.principal.kind === 'user' ? 'USER' : 'SERVICE_ACCOUNT',
      principalId: input.principal.sub,
      organisationId,
      action: input.action,
    });
    const response = await this.options.fetchFn(`${this.options.baseUrl}/api/v1/authz/check`, { method: 'POST', headers, body });
    if (response.status === TOO_MANY_REQUESTS) {
      throw AuthErrorCode.PDP_UNAVAILABLE.create({ reason: 'identity throttled the check', throttled: true, retryAfterSeconds: retryAfterSecondsOf(response) });
    }
    if (!response.ok) throw AuthErrorCode.PDP_UNAVAILABLE.create({ reason: `pdp returned http ${response.status}` });

    const result = (await response.json()) as PdpResponse;
    if (result.decision !== 'PERMIT' && result.decision !== 'DENY') throw AuthErrorCode.PDP_UNAVAILABLE.create({ reason: 'malformed pdp response' });

    const authzVersion = result.authzVersion ?? 0;
    this.observeVersion(principalKey, authzVersion);
    const permitted = result.decision === 'PERMIT';
    this.logger.debug('pdp decision', { principal: principalKey, organisationId, action: input.action, decision: result.decision });
    const baseTtl = this.options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const ttlSeconds = options.highRisk ? Math.min(HIGH_RISK_TTL_SECONDS, baseTtl) : baseTtl;
    this.store(key, { permitted, authzVersion, expiresAt: Date.now() + ttlSeconds * 1000 });
    return permitted;
  }

  private observeVersion(principalKey: string, version: number): void {
    const known = this.versions.get(principalKey) ?? 0;
    if (version <= known) return;
    this.logger.debug('authz version bump observed; invalidating cached decisions', { principal: principalKey, version });
    this.versions.set(principalKey, version);
    for (const [key, entry] of this.cache) {
      if (key.startsWith(`${principalKey}:`) && entry.authzVersion < version) this.cache.delete(key);
    }
  }

  private store(key: string, entry: CachedDecision): void {
    this.cache.delete(key);
    this.cache.set(key, entry);
    if (this.cache.size <= (this.options.maxEntries ?? DEFAULT_MAX_ENTRIES)) return;
    const oldest = this.cache.keys().next().value;
    if (oldest) this.cache.delete(oldest);
  }
}
