/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AuthError } from '../errors';
import { FetchLike, Jwk } from '../interfaces';
import { DiscoveryClient } from './discovery';

/**
 * Defining types
 */

export interface RemoteJwksOptions {
  discovery: DiscoveryClient;
  fetchFn: FetchLike;
  ttlSeconds: number;
}

/**
 * Declaring the constants
 *
 * Keys are imported once as `CryptoKey` objects and cached for `ttlSeconds`. An unknown `kid`
 * triggers one immediate refetch (singleflight, with a short negative cache) so key rotation is
 * zero-config for consumers. When a refresh fails but cached keys exist, verification keeps using
 * the stale set — an unknown `kid` with an unreachable JWKS endpoint still fails closed.
 */
const NEGATIVE_CACHE_MS = 10_000;

export class RemoteJwks {
  private keys = new Map<string, CryptoKey>();
  private fetchedAt = 0;
  private lastMissAt = 0;
  private inflight: Promise<void> | null = null;

  constructor(private readonly options: RemoteJwksOptions) {}

  async getKey(kid: string): Promise<CryptoKey> {
    const isStale = Date.now() - this.fetchedAt >= this.options.ttlSeconds * 1000;
    if (isStale) {
      await this.refresh().catch(error => {
        if (this.keys.size === 0) throw error;
      });
    }

    let key = this.keys.get(kid);
    if (!key && Date.now() - this.lastMissAt > NEGATIVE_CACHE_MS) {
      await this.refresh();
      key = this.keys.get(kid);
      if (!key) this.lastMissAt = Date.now();
    }
    if (!key) throw new AuthError('KEY_UNKNOWN', `no published key matches kid '${kid}'`);
    return key;
  }

  private refresh(): Promise<void> {
    this.inflight ??= this.load().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async load(): Promise<void> {
    const document = await this.options.discovery.get();
    const response = await this.options.fetchFn(document.jwks_uri).catch((error: Error) => {
      throw new AuthError('DISCOVERY_FAILED', `jwks fetch failed: ${error.message}`);
    });
    if (!response.ok) throw new AuthError('DISCOVERY_FAILED', `jwks endpoint returned http ${response.status}`);

    const body = (await response.json()) as { keys?: Jwk[] };
    const keys = new Map<string, CryptoKey>();
    for (const jwk of body.keys ?? []) {
      if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.kid) continue;
      keys.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, 'Ed25519', false, ['verify']));
    }

    this.keys = keys;
    this.fetchedAt = Date.now();
  }
}
