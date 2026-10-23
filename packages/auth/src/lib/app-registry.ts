import { AppError, Logger, throwError } from '@shadow-library/common';

import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { AppRegistration, FetchLike } from '../interfaces';

export interface AppRegistryClientOptions {
  baseUrl: string;
  fetchFn: FetchLike;

  /** `/apps/me` answers about whoever holds this bearer */
  getToken: () => Promise<string>;

  /** Cross-checked against what identity answers, so a credential bound elsewhere fails loudly */
  appId?: string;

  refreshSeconds?: number;
}

// Refreshed on a TTL because the registration is live administration. As with service-access rules, the first resolve throws and fails the boot,
// while a later failed refresh keeps the last good registration: an identity outage must not change the audience a service accepts or the scopes it requests.
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

  get(): Promise<AppRegistration> {
    const registration = this.registration;
    if (registration && Date.now() - this.resolvedAt < this.refreshSeconds * 1000) return Promise.resolve(registration);

    this.inflight ??= this.resolve().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async resolve(): Promise<AppRegistration> {
    return this.request().catch((error: AppError) => {
      if (!this.registration) throw error;

      this.logger.warn('app registration refresh failed; keeping the last good registration', { reason: error.message });
      this.resolvedAt = Date.now();
      return this.registration;
    });
  }

  private async request(): Promise<AppRegistration> {
    const token = await this.options.getToken();
    const response = await this.options
      .fetchFn(`${this.options.baseUrl}${APP_REGISTRATION_PATH}`, { headers: { authorization: `Bearer ${token}` } })
      .catch((error: Error) => throwError(this.logged(AuthErrorCode.APP_REGISTRATION_FAILED.create({ reason: `app registration fetch failed: ${error.message}` }))));
    if (!response.ok) throw this.logged(AuthErrorCode.APP_REGISTRATION_FAILED.create({ reason: `app registration endpoint returned http ${response.status}` }));

    const registration = normalise((await response.json()) as Partial<AppRegistration>);
    if (!registration.audience) throw this.logged(AuthErrorCode.APP_REGISTRATION_FAILED.create({ reason: 'identity published no audience for this application' }));

    // A credential provisioned against another application would hand this service someone else's audience and scopes: it would boot, then reject every token addressed to it
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

  private logged(error: AppError): AppError {
    this.logger.error(error.message);
    return error;
  }
}

function normalise(body: Partial<AppRegistration>): AppRegistration {
  return {
    appId: body.appId ?? '',
    name: body.name,
    audience: body.audience ?? '',
    redirectUris: body.redirectUris ?? [],
    scopes: body.scopes ?? [],
    sensitiveScopes: body.sensitiveScopes ?? [],
    postLogoutRedirectUris: body.postLogoutRedirectUris,
  };
}
