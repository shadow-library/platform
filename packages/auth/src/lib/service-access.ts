/**
 * Importing npm packages
 */
import { AppError, Logger, throwError } from '@shadow-library/common';

/**
 * Importing user defined packages
 */
import { NAMESPACE } from '../constants';
import { AuthErrorCode } from '../errors';
import { FetchLike, ServiceAccessRule } from '../interfaces';

/**
 * Defining types
 */

export interface ServiceAccessClientOptions {
  /** Where identity is reached over the back channel; the public issuer unless `identityUrl` overrides it */
  baseUrl: string;
  fetchFn: FetchLike;

  /** Supplies the application's own M2M bearer, which must carry the `authz:check` scope */
  getToken: () => Promise<string>;

  refreshSeconds?: number;
}

/**
 * Declaring the constants
 *
 * The admin-configured M2M route allowlist, held locally so the guard can answer synchronously. It is
 * re-fetched on an interval rather than loaded once, because the rules are the only thing standing
 * between a revoked caller and this service's routes: loading at boot alone makes revocation latency
 * unbounded — the caller keeps its access until someone happens to restart the target.
 *
 * The two failure paths are deliberately asymmetric. The initial load throws, so a service that never
 * learned its rules aborts the boot instead of silently denying every caller forever. A later refresh
 * only warns and keeps the last good rules, because an identity outage must not revoke every M2M
 * caller of every service at once.
 */
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

  /**
   * The startup load. A failure propagates: until the rules are known every service-to-service caller
   * is denied, and a boot that swallows this would look healthy while refusing all of its peers.
   */
  async load(): Promise<ServiceAccessRule[]> {
    const rules = await this.fetch();
    this.startRefresh();
    return rules;
  }

  /**
   * A refresh that never throws, so neither the interval nor a manual operator call can turn an
   * identity outage into a request-path failure. On any error the last good rules stay in force.
   */
  async refresh(): Promise<ServiceAccessRule[]> {
    return this.fetch().catch((error: Error) => {
      this.logger.warn('service access refresh failed; keeping the last good rules', { reason: error.message, rules: this.rules?.length ?? 0 });
      return this.rules ?? [];
    });
  }

  /** Whether an M2M caller may invoke the given route, per the rules last loaded from identity */
  isAllowed(callerClientId: string, method: string, path: string): boolean {
    if (!this.rules) return false;
    return this.rules.some(rule => rule.callerClientId === callerClientId && matchesMethod(rule.method, method) && matchesPath(rule.path, path));
  }

  /** Releases the refresh interval; without it a long-lived timer would outlive the application */
  stopRefresh(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.logger.debug('service access refresh stopped');
  }

  private startRefresh(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.refresh(), this.refreshSeconds * 1000);

    /** The interval must never be the reason a process refuses to exit */
    this.timer.unref?.();
    this.logger.info('service access refresh scheduled', { refreshSeconds: this.refreshSeconds });
  }

  /** Concurrent callers — the interval and a request-path retry — share one round trip */
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

  /** Records the failure at error level before it propagates, keeping guard throws single-line */
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
