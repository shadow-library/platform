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
 *
 * Endpoints split by who dials them. Back-channel endpoints are called by this process, so when the
 * SDK reaches identity at an internal address they must be rebased onto it. Front-channel endpoints
 * — `authorization_endpoint`, `end_session_endpoint`, `step_up_endpoint` — are URLs a **browser** is
 * redirected to, and rebasing one onto a cluster-internal host would send the user somewhere they
 * cannot resolve. This is an allowlist rather than a denylist so a newly published endpoint is left
 * public by default: a front-channel endpoint wrongly rebased breaks login silently, while a
 * back-channel one left public still works, only over the long path.
 */
const BACK_CHANNEL_ENDPOINTS = ['jwks_uri', 'token_endpoint', 'userinfo_endpoint', 'introspection_endpoint', 'revocation_endpoint', 'app_session_endpoint'] as const;

export class DiscoveryClient {
  private readonly logger = Logger.getLogger(NAMESPACE, DiscoveryClient.name);
  private document: DiscoveryDocument | null = null;
  private inflight: Promise<DiscoveryDocument> | null = null;

  /**
   * `issuer` is an identity — the value the document must claim, and the audience tokens carry.
   * `baseUrl` is an address — where this process actually sends HTTP. They differ whenever identity
   * is reachable in-cluster under a name that is not its public hostname; RFC 8414 constrains the
   * former and says nothing about the latter, so the two are validated and used independently.
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

  /**
   * Points the back-channel endpoints at `baseUrl`, leaving anything hosted elsewhere untouched so a
   * document that legitimately delegates an endpoint to another origin still resolves there.
   */
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

  /** Records the failure at error level before it propagates, keeping guard throws single-line */
  private logged(error: AppError): AppError {
    this.logger.error(error.message, { issuer: this.issuer, baseUrl: this.baseUrl });
    return error;
  }
}
