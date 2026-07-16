/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AuthError, AuthErrorCode } from '../errors';

/**
 * Defining types
 */

export interface ServiceDiscoveryOptions {
  /** Appended to the service name when building the default in-cluster URL, e.g. `.prod.svc.cluster.local` */
  domainSuffix?: string;

  /** Scheme of the default in-cluster URL. Defaults to `http` (in-cluster traffic behind the mesh) */
  scheme?: 'http' | 'https';

  /** Environment source override, primarily for tests. Defaults to `process.env` */
  env?: Record<string, string | undefined>;
}

/**
 * Declaring the constants
 *
 * Inside Kubernetes a Service is reachable by its own name (`http://pulse` resolves via cluster
 * DNS in the same namespace), so the service name IS the domain by default. A per-service
 * `SERVICE_URL_<NAME>` env variable overrides the resolution for services living outside the
 * cluster or under a custom domain, and `SERVICE_DISCOVERY_SUFFIX` / `SERVICE_DISCOVERY_SCHEME`
 * adjust the default for cross-namespace or TLS-only clusters.
 */
const SERVICE_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

export class ServiceDiscovery {
  private readonly env: Record<string, string | undefined>;

  constructor(private readonly options: ServiceDiscoveryOptions = {}) {
    this.env = options.env ?? process.env;
  }

  /** Resolves a service name to its base URL: env override first, in-cluster svc DNS otherwise */
  resolve(service: string): string {
    if (!SERVICE_NAME_PATTERN.test(service)) throw new AuthError(AuthErrorCode.SERVICE_UNKNOWN, `'${service}' is not a valid service name`);

    const override = this.env[`SERVICE_URL_${service.toUpperCase().replaceAll('-', '_')}`];
    if (override) {
      if (!URL.canParse(override)) throw new AuthError(AuthErrorCode.SERVICE_UNKNOWN, `service url override for '${service}' is not a valid url`);
      return override.replace(/\/+$/, '');
    }

    const scheme = this.options.scheme ?? this.env['SERVICE_DISCOVERY_SCHEME'] ?? 'http';
    const suffix = this.options.domainSuffix ?? this.env['SERVICE_DISCOVERY_SUFFIX'] ?? '';
    return `${scheme}://${service}${suffix}`;
  }

  /** Builds a full URL for a path on the named service */
  url(service: string, path: string): string {
    const base = this.resolve(service);
    return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
  }
}
