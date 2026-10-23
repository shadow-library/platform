import { AppError, Logger, throwError } from '@shadow-library/common';

import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { FetchLike, ServiceAccessRule } from '../interfaces';

export interface ServiceAccessClientOptions {
  baseUrl: string;
  fetchFn: FetchLike;

  /** Must carry the `authz:check` scope */
  getToken: () => Promise<string>;

  refreshSeconds?: number;
}

// Re-fetched on an interval because loading at boot alone makes revocation latency unbounded.
// The failure paths are asymmetric: the initial load throws so a service that never learned its rules aborts the boot instead of denying every caller forever,
// while a later refresh warns and keeps the last good rules so an identity outage cannot revoke every M2M caller of every service.
const DEFAULT_REFRESH_SECONDS = 300;

const SERVICE_ACCESS_PATH = '/api/v1/authz/service-access';

export class ServiceAccessClient {
  private readonly logger = Logger.getLogger(NAMESPACE, ServiceAccessClient.name);
  private readonly refreshSeconds: number;

  private rules: ServiceAccessRule[] | null = null;
  private inflight: Promise<ServiceAccessRule[]> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: ServiceAccessClientOptions) {
    this.refreshSeconds = options.refreshSeconds ?? DEFAULT_REFRESH_SECONDS;
  }

  async load(): Promise<ServiceAccessRule[]> {
    const rules = await this.fetch();
    this.startRefresh();
    return rules;
  }

  async refresh(): Promise<ServiceAccessRule[]> {
    return this.fetch().catch((error: Error) => {
      this.logger.warn('service access refresh failed; keeping the last good rules', { reason: error.message, rules: this.rules?.length ?? 0 });
      return this.rules ?? [];
    });
  }

  isAllowed(callerClientId: string, method: string, path: string): boolean {
    if (!this.rules) return false;
    return this.rules.some(rule => rule.callerClientId === callerClientId && matchesMethod(rule.method, method) && matchesPath(rule.path, path));
  }

  stopRefresh(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.logger.debug('service access refresh stopped');
  }

  private startRefresh(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.refresh(), this.refreshSeconds * 1000);

    // The interval must never keep the process alive
    this.timer.unref?.();
    this.logger.info('service access refresh scheduled', { refreshSeconds: this.refreshSeconds });
  }

  private fetch(): Promise<ServiceAccessRule[]> {
    this.inflight ??= this.request().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async request(): Promise<ServiceAccessRule[]> {
    const token = await this.options.getToken();
    const response = await this.options
      .fetchFn(`${this.options.baseUrl}${SERVICE_ACCESS_PATH}`, { headers: { authorization: `Bearer ${token}` } })
      .catch((error: Error) => throwError(this.logged(AuthErrorCode.SERVICE_ACCESS_FAILED.create({ reason: `service access fetch failed: ${error.message}` }))));
    if (!response.ok) throw this.logged(AuthErrorCode.SERVICE_ACCESS_FAILED.create({ reason: `service access endpoint returned http ${response.status}` }));

    const body = (await response.json()) as { rules?: ServiceAccessRule[] };
    this.rules = body.rules ?? [];
    this.logger.info('service access rules loaded', { rules: this.rules.length });
    return this.rules;
  }

  private logged(error: AppError): AppError {
    this.logger.error(error.message);
    return error;
  }
}

function matchesMethod(pattern: string, method: string): boolean {
  return pattern === '*' || pattern.toUpperCase() === method.toUpperCase();
}

/** A trailing `*` matches any suffix (e.g. `/api/v1/posts/*`); everything else is an exact path */
function matchesPath(pattern: string, path: string): boolean {
  if (pattern.endsWith('*')) return path.startsWith(pattern.slice(0, -1));
  return pattern === path;
}
