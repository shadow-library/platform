/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { ErrorCode } from '@lib/errors';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */
const SERVICE_SCHEME = 'svc://';

/** A DNS label, optionally dotted so `pulse-server.<namespace>` can target another namespace */
const SERVICE_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

const DEFAULT_SCHEME = 'http';

/**
 * Turns a service name into an address, so that every caller in the ecosystem answers "where is
 * service X" the same way. In Kubernetes a Service is reachable by its own name through cluster DNS,
 * so the name is the host and the cluster decides where it resolves; `SERVICE_URL_<NAME>` overrides
 * that for local development or an out-of-cluster target.
 *
 * `APIRequest` consumes this for `svc://` urls, and packages that cannot route through `APIRequest` —
 * `@shadow-library/auth` dials the OIDC paths with a bare `fetch`, because a token endpoint mandates
 * form encoding and its callers read a `Response` directly — consume it for the address alone. The
 * point of the split is that both arrive at the same host by the same rules.
 */
export class ServiceDiscoveryService {
  /**
   * Read per call rather than cached at construction. The singleton outlives any individual request,
   * and a cache would make the override invisible to anything that sets it after first use — which
   * is exactly what a test does between cases.
   *
   * `process.env` directly rather than `Config`: the key is derived from the service name, so there
   * is no fixed key to declare in `ConfigRecords`, and `Config` itself lives one layer below this.
   */
  private env(key: string): string | undefined {
    return process.env[key]?.trim() || undefined;
  }

  private get scheme(): string {
    return this.env('SERVICE_DISCOVERY_SCHEME') ?? DEFAULT_SCHEME;
  }

  /**
   * The base address of a named service, without a trailing slash. `pulse-server` reads its override
   * from `SERVICE_URL_PULSE_SERVER` — dots and dashes both become underscores. An override carrying
   * its own `scheme://` is used verbatim; otherwise `SERVICE_DISCOVERY_SCHEME` (default `http`)
   * supplies the scheme, the same scheme applied to the in-cluster service host.
   */
  getUrl(service: string): string {
    if (!SERVICE_NAME_PATTERN.test(service)) throw ErrorCode.SERVICE_UNKNOWN.create({ reason: `'${service}' is not a valid service name` });

    const envName = `SERVICE_URL_${service.toUpperCase().replace(/[-.]/g, '_')}`;
    const override = this.env(envName);
    if (!override) return `${this.scheme}://${service}`;

    const base = URL_SCHEME_PATTERN.test(override) ? override : `${this.scheme}://${override}`;
    if (!URL.canParse(base)) throw ErrorCode.SERVICE_UNKNOWN.create({ reason: `service url override for '${service}' is not a valid url` });
    return base.replace(/\/+$/, '');
  }

  /**
   * Resolves a `svc://<service>/<path>` url to an address; every other url is returned untouched, so
   * this is safe to apply to any url a caller hands over without inspecting it first.
   */
  resolve(url: string): string {
    if (!url.startsWith(SERVICE_SCHEME)) return url;

    const rest = url.slice(SERVICE_SCHEME.length);
    const separator = rest.indexOf('/');
    const service = separator === -1 ? rest : rest.slice(0, separator);
    const path = separator === -1 ? '' : rest.slice(separator);
    return `${this.getUrl(service)}${path}`;
  }
}

const globalRef = global as any;
export const ServiceDiscovery: ServiceDiscoveryService = globalRef.serviceDiscoveryService || (globalRef.serviceDiscoveryService = new ServiceDiscoveryService());
