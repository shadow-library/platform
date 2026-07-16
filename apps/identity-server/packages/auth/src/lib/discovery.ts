/**
 * Importing npm packages
 */
import { AppError, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
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
  private readonly logger = Logger.getLogger(NAMESPACE, DiscoveryClient.name);
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
    this.logger.debug('fetching oidc discovery document', { issuer: this.issuer });
    const response = await this.fetchFn(`${this.issuer}/.well-known/openid-configuration`).catch((error: Error) =>
      throwError(this.logged(AuthErrorCode.DISCOVERY_FAILED.create({ reason: `discovery fetch failed: ${error.message}` }))),
    );
    if (!response.ok) throw this.logged(AuthErrorCode.DISCOVERY_FAILED.create({ reason: `discovery endpoint returned http ${response.status}` }));

    const document = (await response.json()) as DiscoveryDocument;
    if (document.issuer !== this.issuer) throw this.logged(AuthErrorCode.DISCOVERY_FAILED.create({ reason: 'discovery issuer does not match the configured issuer' }));
    if (!document.jwks_uri || !document.token_endpoint) throw this.logged(AuthErrorCode.DISCOVERY_FAILED.create({ reason: 'discovery document is missing required endpoints' }));

    this.document = document;
    this.logger.info('oidc discovery document loaded', { issuer: this.issuer });
    return document;
  }

  /** Records the failure at error level before it propagates, keeping guard throws single-line */
  private logged(error: AppError): AppError {
    this.logger.error(error.message, { issuer: this.issuer });
    return error;
  }
}
