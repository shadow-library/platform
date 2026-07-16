/**
 * Importing npm packages
 */
import { readFile } from 'node:fs/promises';

import { AppError, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
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

/** RFC 7523 §2.2 — authenticating with a JWT (here: a projected k8s service-account token) */
const JWT_BEARER_ASSERTION_TYPE = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer';

export class ServiceTokenManager {
  private readonly logger = Logger.getLogger(NAMESPACE, ServiceTokenManager.name);
  private readonly cache = new Map<string, CachedToken>();
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(private readonly options: ServiceTokenManagerOptions) {}

  async getToken(options: ServiceTokenOptions = {}): Promise<string> {
    const client = this.options.client;
    if (!client) throw AuthErrorCode.CONFIG_INVALID.create({ reason: 'service tokens require client credentials' });

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
    this.logger.debug('service token invalidated', { resource: options.resource, scopes: options.scopes });
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
    const body: Record<string, string> = { grant_type: 'client_credentials' };
    if (client.assertionPath) {
      body.client_id = client.id;
      body.client_assertion_type = JWT_BEARER_ASSERTION_TYPE;
      body.client_assertion = await this.readAssertion(client.assertionPath);
    } else if (client.secret) {
      headers.authorization = `Basic ${Buffer.from(`${client.id}:${client.secret}`).toString('base64')}`;
    } else {
      body.client_id = client.id;
    }
    if (scopes.length > 0) body.scope = scopes.join(' ');
    if (options.resource) body.resource = options.resource;

    /** Debug-only: the body may carry the client assertion */
    this.logger.debug('requesting service token', { url: document.token_endpoint, body });
    const response = await this.options
      .fetchFn(document.token_endpoint, { method: 'POST', headers, body: JSON.stringify(body) })
      .catch((error: Error) => throwError(this.logged(AuthErrorCode.TOKEN_REQUEST_FAILED.create({ reason: `token request failed: ${error.message}` }))));
    if (!response.ok) throw this.logged(AuthErrorCode.TOKEN_REQUEST_FAILED.create({ reason: `token endpoint returned http ${response.status}` }));

    const payload = (await response.json()) as TokenEndpointResponse;
    if (!payload.access_token || typeof payload.expires_in !== 'number')
      throw this.logged(AuthErrorCode.TOKEN_REQUEST_FAILED.create({ reason: 'malformed token endpoint response' }));

    this.logger.info('service token minted', { clientId: client.id, resource: options.resource, scopes, expiresIn: payload.expires_in });
    const refreshSkew = this.options.refreshSkewSeconds ?? DEFAULT_REFRESH_SKEW_SECONDS;
    this.cache.set(key, { token: payload.access_token, expiresAt: Date.now() + (payload.expires_in - refreshSkew) * 1000 });
    return payload.access_token;
  }

  /** Read fresh on every request — the kubelet rotates the projected token in place */
  private async readAssertion(path: string): Promise<string> {
    const assertion = await readFile(path, 'utf8').catch((error: Error) =>
      throwError(this.logged(AuthErrorCode.TOKEN_REQUEST_FAILED.create({ reason: `could not read service-account token at '${path}': ${error.message}` }))),
    );
    const trimmed = assertion.trim();
    if (!trimmed) throw this.logged(AuthErrorCode.TOKEN_REQUEST_FAILED.create({ reason: `service-account token at '${path}' is empty` }));
    return trimmed;
  }

  /** Records the failure at error level before it propagates, keeping guard throws single-line */
  private logged(error: AppError): AppError {
    this.logger.error(error.message);
    return error;
  }
}
