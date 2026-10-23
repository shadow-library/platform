import { AppError, Logger, throwError } from '@shadow-library/common';

import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { FetchLike, Jwk } from '../interfaces';
import { DiscoveryClient } from './discovery';

export interface RemoteJwksOptions {
  discovery: DiscoveryClient;
  fetchFn: FetchLike;
  ttlSeconds: number;
}

// An unknown `kid` triggers one refetch (singleflight, short negative cache) so rotation needs no consumer config; a failed refresh serves the stale set, but an unknown
// `kid` with an unreachable endpoint still fails closed
const NEGATIVE_CACHE_MS = 10_000;

export class RemoteJwks {
  private readonly logger = Logger.getLogger(NAMESPACE, RemoteJwks.name);
  private keys = new Map<string, CryptoKey>();
  private fetchedAt = 0;
  private lastMissAt = 0;
  private inflight: Promise<void> | null = null;

  constructor(private readonly options: RemoteJwksOptions) {}

  async getKey(kid: string): Promise<CryptoKey> {
    const isStale = Date.now() - this.fetchedAt >= this.options.ttlSeconds * 1000;
    if (isStale) {
      await this.refresh().catch((error: Error) => {
        if (this.keys.size === 0) throw error;
        this.logger.warn('jwks refresh failed; serving cached keys', { reason: error.message });
      });
    }

    let key = this.keys.get(kid);
    if (!key && Date.now() - this.lastMissAt > NEGATIVE_CACHE_MS) {
      this.logger.debug('unknown kid, refetching jwks', { kid });
      await this.refresh();
      key = this.keys.get(kid);
      if (!key) this.lastMissAt = Date.now();
    }
    if (!key) {
      // Client-supplied input, not a system fault: warn, not error
      this.logger.warn('no published key matches the token kid', { kid });
      throw AuthErrorCode.KEY_UNKNOWN.create({ reason: `no published key matches kid '${kid}'` });
    }
    return key;
  }

  private refresh(): Promise<void> {
    this.inflight ??= this.load().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async load(): Promise<void> {
    const document = await this.options.discovery.get();
    this.logger.debug('fetching jwks', { url: document.jwks_uri });
    const response = await this.options
      .fetchFn(document.jwks_uri)
      .catch((error: Error) => throwError(this.logged(AuthErrorCode.DISCOVERY_FAILED.create({ reason: `jwks fetch failed: ${error.message}` }))));
    if (!response.ok) throw this.logged(AuthErrorCode.DISCOVERY_FAILED.create({ reason: `jwks endpoint returned http ${response.status}` }));

    const body = (await response.json()) as { keys?: Jwk[] };
    const keys = new Map<string, CryptoKey>();
    for (const jwk of body.keys ?? []) {
      if (jwk.kty !== 'OKP' || jwk.crv !== 'Ed25519' || !jwk.kid) continue;
      keys.set(jwk.kid, await crypto.subtle.importKey('jwk', jwk, 'Ed25519', false, ['verify']));
    }

    this.keys = keys;
    this.fetchedAt = Date.now();
    this.logger.info('jwks refreshed', { keyCount: keys.size });
  }

  private logged(error: AppError): AppError {
    this.logger.error(error.message);
    return error;
  }
}
