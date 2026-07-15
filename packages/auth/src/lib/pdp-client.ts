/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AuthError } from '../errors';
import { CheckInput, CheckOptions, FetchLike } from '../interfaces';

/**
 * Defining types
 */

export interface PdpClientOptions {
  issuer: string;
  fetchFn: FetchLike;
  /** Supplies the SDK's own M2M bearer for PDP calls; a failed acquisition falls back to an unauthenticated call */
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

/**
 * Declaring the constants
 *
 * Decisions are cached in a small LRU keyed by (principal, organisation, action). Every PDP
 * response piggybacks the principal's `authz_version`; observing a bump discards that principal's
 * stale entries so grant changes propagate within one round-trip instead of a full TTL. Transport
 * failures and malformed responses are a DENY unless the caller explicitly opted into fail-open.
 */
const DEFAULT_TTL_SECONDS = 900;
const HIGH_RISK_TTL_SECONDS = 60;
const DEFAULT_MAX_ENTRIES = 1000;

export class PdpClient {
  private readonly cache = new Map<string, CachedDecision>();
  private readonly versions = new Map<string, number>();

  constructor(private readonly options: PdpClientOptions) {}

  async check(input: CheckInput, options: CheckOptions = {}): Promise<boolean> {
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
      return await this.request(principalKey, key, organisationId, input, options);
    } catch {
      return options.failOpen ?? false;
    }
  }

  checkAll(inputs: CheckInput[], options: CheckOptions = {}): Promise<boolean[]> {
    return Promise.all(inputs.map(input => this.check(input, options)));
  }

  private async request(principalKey: string, key: string, organisationId: string, input: CheckInput, options: CheckOptions): Promise<boolean> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    const token = await this.options.getToken?.().catch(() => null);
    if (token) headers.authorization = `Bearer ${token}`;

    const body = JSON.stringify({
      principalType: input.principal.kind === 'service' ? 'SERVICE_ACCOUNT' : 'USER',
      principalId: input.principal.sub,
      organisationId,
      action: input.action,
    });
    const response = await this.options.fetchFn(`${this.options.issuer}/api/v1/authz/check`, { method: 'POST', headers, body });
    if (!response.ok) throw new AuthError('PDP_UNAVAILABLE', `pdp returned http ${response.status}`);

    const result = (await response.json()) as PdpResponse;
    if (result.decision !== 'PERMIT' && result.decision !== 'DENY') throw new AuthError('PDP_UNAVAILABLE', 'malformed pdp response');

    const authzVersion = result.authzVersion ?? 0;
    this.observeVersion(principalKey, authzVersion);
    const permitted = result.decision === 'PERMIT';
    const baseTtl = this.options.ttlSeconds ?? DEFAULT_TTL_SECONDS;
    const ttlSeconds = options.highRisk ? Math.min(HIGH_RISK_TTL_SECONDS, baseTtl) : baseTtl;
    this.store(key, { permitted, authzVersion, expiresAt: Date.now() + ttlSeconds * 1000 });
    return permitted;
  }

  private observeVersion(principalKey: string, version: number): void {
    const known = this.versions.get(principalKey) ?? 0;
    if (version <= known) return;
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
