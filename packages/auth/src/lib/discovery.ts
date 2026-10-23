import { AppError, Logger, throwError } from '@shadow-library/common';

import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { DiscoveryDocument, FetchLike } from '../interfaces';

// Front-channel endpoints (`authorization_endpoint`, `end_session_endpoint`, `step_up_endpoint`) are redirected to by a browser and must not be rebased onto a cluster-
// internal host.
// An allowlist, not a denylist: a new endpoint defaults to public because a wrongly rebased front-channel endpoint breaks login silently, while a back-channel one left
// public still works.
const BACK_CHANNEL_ENDPOINTS = ['jwks_uri', 'token_endpoint', 'userinfo_endpoint', 'introspection_endpoint', 'revocation_endpoint', 'app_session_endpoint'] as const;

export class DiscoveryClient {
  private readonly logger = Logger.getLogger(NAMESPACE, DiscoveryClient.name);
  private document: DiscoveryDocument | null = null;
  private inflight: Promise<DiscoveryDocument> | null = null;

  /**
   * `issuer` is the identity the document must claim (RFC 8414); `baseUrl` is where HTTP is actually sent. They differ when identity is reached in-cluster under a non-
   * public name
   */
  constructor(
    private readonly issuer: string,
    private readonly baseUrl: string,
    private readonly fetchFn: FetchLike,
  ) {}

  async get(): Promise<DiscoveryDocument> {
    if (this.document) return this.document;
    this.inflight ??= this.load().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async load(): Promise<DiscoveryDocument> {
    this.logger.debug('fetching oidc discovery document', { issuer: this.issuer, baseUrl: this.baseUrl });
    const response = await this.fetchFn(`${this.baseUrl}/.well-known/openid-configuration`).catch((error: Error) =>
      throwError(this.logged(AuthErrorCode.DISCOVERY_FAILED.create({ reason: `discovery fetch failed: ${error.message}` }))),
    );
    if (!response.ok) throw this.logged(AuthErrorCode.DISCOVERY_FAILED.create({ reason: `discovery endpoint returned http ${response.status}` }));

    const document = (await response.json()) as DiscoveryDocument;
    if (document.issuer !== this.issuer) throw this.logged(AuthErrorCode.DISCOVERY_FAILED.create({ reason: 'discovery issuer does not match the configured issuer' }));
    if (!document.jwks_uri || !document.token_endpoint) throw this.logged(AuthErrorCode.DISCOVERY_FAILED.create({ reason: 'discovery document is missing required endpoints' }));

    this.document = this.rebase(document);
    this.logger.info('oidc discovery document loaded', { issuer: this.issuer, baseUrl: this.baseUrl });
    return this.document;
  }

  private rebase(document: DiscoveryDocument): DiscoveryDocument {
    if (this.baseUrl === this.issuer) return document;

    const issuerOrigin = new URL(this.issuer).origin;
    const rebased: DiscoveryDocument = { ...document };
    for (const key of BACK_CHANNEL_ENDPOINTS) {
      const endpoint = rebased[key];
      if (!endpoint || !URL.canParse(endpoint)) continue;

      const target = new URL(endpoint);
      if (target.origin !== issuerOrigin) continue;
      rebased[key] = `${this.baseUrl}${target.pathname}${target.search}`;
    }
    this.logger.debug('rebased back-channel endpoints onto the internal base url', { baseUrl: this.baseUrl });
    return rebased;
  }

  private logged(error: AppError): AppError {
    this.logger.error(error.message, { issuer: this.issuer, baseUrl: this.baseUrl });
    return error;
  }
}
