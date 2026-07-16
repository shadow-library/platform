/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AuthError, AuthErrorCode } from '../errors';
import { DiscoveryDocument, FetchLike } from '../interfaces';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The discovery document is immutable for the lifetime of a deployment, so it is fetched once per
 * process (singleflight) and cached indefinitely; endpoint changes ship as new deployments.
 */

export class DiscoveryClient {
  private document: DiscoveryDocument | null = null;
  private inflight: Promise<DiscoveryDocument> | null = null;

  constructor(
    private readonly issuer: string,
    private readonly fetchFn: FetchLike,
  ) {}

  async get(): Promise<DiscoveryDocument> {
    if (this.document) return this.document;
    this.inflight ??= this.load().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async load(): Promise<DiscoveryDocument> {
    const response = await this.fetchFn(`${this.issuer}/.well-known/openid-configuration`).catch((error: Error) => {
      throw new AuthError(AuthErrorCode.DISCOVERY_FAILED, `discovery fetch failed: ${error.message}`);
    });
    if (!response.ok) throw new AuthError(AuthErrorCode.DISCOVERY_FAILED, `discovery endpoint returned http ${response.status}`);

    const document = (await response.json()) as DiscoveryDocument;
    if (document.issuer !== this.issuer) throw new AuthError(AuthErrorCode.DISCOVERY_FAILED, 'discovery issuer does not match the configured issuer');
    if (!document.jwks_uri || !document.token_endpoint) throw new AuthError(AuthErrorCode.DISCOVERY_FAILED, 'discovery document is missing required endpoints');

    this.document = document;
    return document;
  }
}
