import { ErrorCode } from '@lib/errors';

const SERVICE_SCHEME = 'svc://';

/** A DNS label, optionally dotted so `pulse-server.<namespace>` can target another namespace */
const SERVICE_NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//i;

const DEFAULT_SCHEME = 'http';

/**
 * In Kubernetes a Service is reachable by its own name through cluster DNS, so the name is the host; `SERVICE_URL_<NAME>` overrides it for local
 * development or an out-of-cluster target. `APIRequest` consumes this for `svc://` urls; callers that cannot use `APIRequest` use it for the address alone.
 */
export class ServiceDiscoveryService {
  /** Read per call so an override set after first use takes effect. `process.env` rather than `Config` because the key derives from the service name. */
  private env(key: string): string | undefined {
    return process.env[key]?.trim() || undefined;
  }

  private get scheme(): string {
    return this.env('SERVICE_DISCOVERY_SCHEME') ?? DEFAULT_SCHEME;
  }

  /**
   * Base address without a trailing slash; `pulse-server` reads `SERVICE_URL_PULSE_SERVER` (dots and dashes become underscores).
   * A `scheme://` override is used verbatim; otherwise `SERVICE_DISCOVERY_SCHEME` (default `http`) supplies the scheme, as it does for the in-cluster host.
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

  /** Resolves a `svc://<service>/<path>` url; every other url is returned untouched. */
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
