/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AuthError } from '../errors';
import { AuthClientCredential, FetchLike, ServiceTokenOptions } from '../interfaces';
import { DiscoveryClient } from './discovery';

/**
 * Defining types
 */

export interface ServiceTokenManagerOptions {
  discovery: DiscoveryClient;
  fetchFn: FetchLike;
  client?: AuthClientCredential;
  refreshSkewSeconds?: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

interface TokenEndpointResponse {
  access_token?: string;
  expires_in?: number;
}

/**
 * Declaring the constants
 *
 * Client-credentials tokens are cached per (resource, scopes) until shortly before expiry, and
 * concurrent callers share one in-flight request (singleflight). Failures surface immediately and
 * are never cached, so a misconfigured client cannot cause a retry storm.
 */
const DEFAULT_REFRESH_SKEW_SECONDS = 60;

export class ServiceTokenManager {
  private readonly cache = new Map<string, CachedToken>();
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(private readonly options: ServiceTokenManagerOptions) {}

  async getToken(options: ServiceTokenOptions = {}): Promise<string> {
    const client = this.options.client;
    if (!client) throw new AuthError('CONFIG_INVALID', 'service tokens require client credentials');

    const key = this.cacheKey(options);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.token;

    const pending = this.inflight.get(key);
    if (pending) return pending;

    const request = this.request(key, options, client).finally(() => this.inflight.delete(key));
    this.inflight.set(key, request);
    return request;
  }

  invalidate(options: ServiceTokenOptions = {}): void {
    this.cache.delete(this.cacheKey(options));
  }

  private cacheKey(options: ServiceTokenOptions): string {
    const scopes = [...(options.scopes ?? [])].sort();
    return `${options.resource ?? ''}|${scopes.join(' ')}`;
  }

  private async request(key: string, options: ServiceTokenOptions, client: AuthClientCredential): Promise<string> {
    const document = await this.options.discovery.get();
    const scopes = [...(options.scopes ?? [])].sort();

    /** The identity token endpoint accepts JSON bodies; public clients authenticate by id only */
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (client.secret) headers.authorization = `Basic ${Buffer.from(`${client.id}:${client.secret}`).toString('base64')}`;
    const body: Record<string, string> = { grant_type: 'client_credentials' };
    if (!client.secret) body.client_id = client.id;
    if (scopes.length > 0) body.scope = scopes.join(' ');
    if (options.resource) body.resource = options.resource;

    const response = await this.options.fetchFn(document.token_endpoint, { method: 'POST', headers, body: JSON.stringify(body) }).catch((error: Error) => {
      throw new AuthError('TOKEN_REQUEST_FAILED', `token request failed: ${error.message}`);
    });
    if (!response.ok) throw new AuthError('TOKEN_REQUEST_FAILED', `token endpoint returned http ${response.status}`);

    const payload = (await response.json()) as TokenEndpointResponse;
    if (!payload.access_token || typeof payload.expires_in !== 'number') throw new AuthError('TOKEN_REQUEST_FAILED', 'malformed token endpoint response');

    const refreshSkew = this.options.refreshSkewSeconds ?? DEFAULT_REFRESH_SKEW_SECONDS;
    this.cache.set(key, { token: payload.access_token, expiresAt: Date.now() + (payload.expires_in - refreshSkew) * 1000 });
    return payload.access_token;
  }
}
