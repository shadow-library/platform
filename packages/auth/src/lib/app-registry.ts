/**
 * Importing npm packages
 */
import { AppError, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { AppRegistration, FetchLike } from '../interfaces';

/**
 * Defining types
 */

export interface AppRegistryClientOptions {
  issuer: string;
  fetchFn: FetchLike;

  /** Supplies the application's own M2M bearer; `/apps/me` answers about whoever holds it */
  getToken: () => Promise<string>;

  /** Cross-checked against what identity answers, so a credential bound elsewhere fails loudly */
  appId?: string;

  refreshSeconds?: number;
}

/**
 * Declaring the constants
 *
 * This application's registration, read back from identity instead of restated in environment
 * variables (D-21). It is refreshed on a TTL rather than resolved once, because the registration is
 * live administration: a scope an admin grants should reach a running service without a redeploy.
 *
 * The failure asymmetry matches the service-access rules. Nothing is known before the first resolve,
 * so that one throws and the boot fails; afterwards a failed refresh warns and the last good
 * registration stays in force, because an identity outage must not change what audience a service
 * accepts or what scopes it requests.
 */
const DEFAULT_REFRESH_SECONDS = 300;

const APP_REGISTRATION_PATH = '/api/v1/apps/me';

export class AppRegistryClient {
  private readonly logger = Logger.getLogger(NAMESPACE, AppRegistryClient.name);
  private readonly refreshSeconds: number;

  private registration: AppRegistration | null = null;
  private resolvedAt = 0;
  private inflight: Promise<AppRegistration> | null = null;

  constructor(private readonly options: AppRegistryClientOptions) {
    this.refreshSeconds = options.refreshSeconds ?? DEFAULT_REFRESH_SECONDS;
  }

  /** The registration, served from cache until its TTL elapses; concurrent callers share one resolve */
  get(): Promise<AppRegistration> {
    const registration = this.registration;
    if (registration && Date.now() - this.resolvedAt < this.refreshSeconds * 1000) return Promise.resolve(registration);

    this.inflight ??= this.resolve().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async resolve(): Promise<AppRegistration> {
    return this.request().catch((error: AppError) => {
      /** Nothing is known yet, so there is nothing to fall back to and the boot must fail */
      if (!this.registration) throw error;

      this.logger.warn('app registration refresh failed; keeping the last good registration', { reason: error.message });
      this.resolvedAt = Date.now();
      return this.registration;
    });
  }

  private async request(): Promise<AppRegistration> {
    const token = await this.options.getToken();
    const response = await this.options
      .fetchFn(`${this.options.issuer}${APP_REGISTRATION_PATH}`, { headers: { authorization: `Bearer ${token}` } })
      .catch((error: Error) => throwError(this.logged(AuthErrorCode.APP_REGISTRATION_FAILED.create({ reason: `app registration fetch failed: ${error.message}` }))));
    if (!response.ok) throw this.logged(AuthErrorCode.APP_REGISTRATION_FAILED.create({ reason: `app registration endpoint returned http ${response.status}` }));

    const registration = normalise((await response.json()) as Partial<AppRegistration>);
    if (!registration.audience) throw this.logged(AuthErrorCode.APP_REGISTRATION_FAILED.create({ reason: 'identity published no audience for this application' }));

    /**
     * A credential provisioned against another application would otherwise hand this service someone
     * else's audience and scopes — it would boot, and then reject every token addressed to it.
     */
    const expected = this.options.appId;
    if (expected && registration.appId && registration.appId !== expected) {
      throw this.logged(AuthErrorCode.CONFIG_INVALID.create({ reason: `credential belongs to application '${registration.appId}', not the configured '${expected}'` }));
    }

    this.registration = registration;
    this.resolvedAt = Date.now();
    this.logger.info('app registration resolved', {
      appId: registration.appId,
      audience: registration.audience,
      scopes: registration.scopes,
      redirectUris: registration.redirectUris.length,
    });
    return registration;
  }

  /** Records the failure at error level before it propagates, keeping guard throws single-line */
  private logged(error: AppError): AppError {
    this.logger.error(error.message);
    return error;
  }
}

/** Identity may add fields and omit optional ones; the SDK works with a complete shape either way */
function normalise(body: Partial<AppRegistration>): AppRegistration {
  return {
    appId: body.appId ?? '',
    name: body.name,
    audience: body.audience ?? '',
    redirectUris: body.redirectUris ?? [],
    scopes: body.scopes ?? [],
    postLogoutRedirectUris: body.postLogoutRedirectUris,
  };
}
